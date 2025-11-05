// Exporters.ts
import { PDFDocument } from 'pdf-lib'
import { Canvg } from 'canvg'
import type { Card } from './types'
import { fillTemplate } from './TemplateRenderer'
import type { ArtFit } from './TemplateRenderer'

const MM_TO_PT = 72 / 25.4
const COLORING_STROKE = 1 // trazo de líneas vectoriales (para colorear)

/* ============================================================================ */
/*                  Ajuste de arte — por carta (string o función)               */
/* ============================================================================ */

type ArtFitParam = ArtFit | ((card: Card) => ArtFit)
const resolveFit = (fit: ArtFitParam | undefined, card: Card): ArtFit =>
  (typeof fit === 'function' ? fit(card) : fit) ?? ((card as any).art_fit ?? 'contain')

/* ============================================================================ */
/*                          Utilidades generales                                */
/* ============================================================================ */
function normalizeSvgRoot(raw: string): string {
  // quita BOM y espacios al inicio
  let s = raw.replace(/^\uFEFF/, '').replace(/^\s+/, '');
  // si no empieza exactamente en <svg …>, intenta extraer el bloque principal
  if (!/^<svg[\s>]/i.test(s)) {
    const m = s.match(/<svg[\s\S]*<\/svg>/i);
    if (m) s = m[0];
  }
  return s;
}

function ensureSvgSize(svg: string, pxW: number, pxH: number) {
  svg = normalizeSvgRoot(svg); // <- importante

  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
    let a = String(attrs || '')
      .replace(/\swidth="[^"]*"/i, '')
      .replace(/\sheight="[^"]*"/i, '');

    if (!/viewBox=/i.test(a)) {
      const wM = /\bwidth="([\d.]+)(px)?"/i.exec(attrs);
      const hM = /\bheight="([\d.]+)(px)?"/i.exec(attrs);
      const w = wM ? parseFloat(wM[1]) : pxW;
      const h = hM ? parseFloat(hM[1]) : pxH;
      a += ` viewBox="0 0 ${w} ${h}"`;
    }

    a = a.trim();
    const space = a.length ? ' ' : '';
    return `<svg${space}${a} width="${pxW}px" height="${pxH}px">`;
  });
}

async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const v = Canvg.fromString(ctx, svg, { ignoreDimensions: true, ignoreClear: true })
  await v.render()
  return canvas.toDataURL('image/png')
}

async function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const v = Canvg.fromString(ctx, svg, { ignoreDimensions: true, ignoreClear: true })
  await v.render()
  return canvas
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

function safe(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_')
}

/* ============================================================================ */
/*             MAPEOS para que el template use los datos del editor             */
/* ============================================================================ */

function computeIconosText(c: Partial<Card>) {
  const el = (c.elemento || '').toString().trim()
  const rz = (c.rareza || '').toString().trim()
  return [el, rz].filter(Boolean).join(' · ')
}

/** Convierte nombres del editor → nombres esperados en el SVG */
function mapCardToTemplateVars(card: Card) {
  const iconos = computeIconosText(card)
  return {
    ...card,
    // alias esperados por el SVG
    tipo: (card as any).tipo ?? card.elemento,
    ataque: (card as any).ataque ?? (card as any).atk ?? (card as any).ATK,
    defensa: (card as any).defensa ?? (card as any).def ?? (card as any).DEF,
    poder_1: (card as any).poder_1 ?? (card as any).poder1,
    poder_2: (card as any).poder_2 ?? (card as any).poder2,
    poder_especial: (card as any).poder_especial ?? (card as any).especial,
    texto_efecto: (card as any).texto_efecto ?? (card as any).efecto ?? '',
    texto_efecto_wrapped: (card as any).texto_efecto_wrapped ?? (card as any).efecto ?? '',
    // variantes de nombre por compatibilidad
    iconos_text: iconos,
    IconosText: iconos,
    iconosText: iconos,
  }
}

/* ============================================================================ */
/*                    MODO “PARA COLOREAR” – PATCH DE SVG                       */
/* ============================================================================ */

/** Edita el <style> del SVG: textos negros; .accent blanco+trazo; .accent-2 negro sin trazo */
function patchStyleForColoring(svg: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')

  const reFill = /fill\s*:\s*[^;]+;?/gi
  const reStroke = /stroke(?:-width)?\s*:\s*[^;]+;?/gi

  const patchCss = (css: string) =>
    css.replace(/([^{}]+)\{([^}]*)\}/g, (_m, selRaw, bodyRaw) => {
      const selectors = String(selRaw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const orig = String(bodyRaw)

      let out = ''
      for (const s of selectors) {
        let body = orig

        // Reglas tipográficas → texto negro sin stroke
        const isTextSel =
          /\btext\b|\btspan\b/i.test(s) ||
          /( |;|^)font\b|font-weight\b/i.test(body)

        if (isTextSel) {
          body = body.replace(reFill, '').replace(reStroke, '')
          body = `fill:#000 !important;${body}`
        }

        // Detección precisa de .accent vs .accent-2 (sin colisión)
        const isAccent2 = /\.accent-2(?![-\w])/i.test(s)
        const isAccent = !isAccent2 && /\.accent(?![-\w])/i.test(s)

        if (isAccent) {
          body = body.replace(reFill, '').replace(reStroke, '')
          body =
            `fill:#fff !important;` +
            `stroke:#000 !important;` +
            `stroke-width:${COLORING_STROKE} !important;` +
            `paint-order:stroke fill;` +
            body
        } else if (isAccent2) {
          body = body.replace(reFill, '').replace(reStroke, '')
          body = `fill:#000 !important;stroke:none !important;${body}`
        }

        out += `${s}{${body}}`
      }
      return out
    })

  Array.from(doc.querySelectorAll('style')).forEach((st) => {
    st.textContent = patchCss(st.textContent || '')
  })

  // Salvavidas si el template no define estas clases (queda al final y gana)
  const extra = doc.createElementNS('http://www.w3.org/2000/svg', 'style')
  extra.textContent = `
  /* Fuerza blanco + trazo negro para TODO lo vectorial, incluido el marco */
  .frame, .frame-inner,
  path, rect, circle, ellipse, polygon, polyline, line {
    fill:#fff !important;
    stroke:#000 !important;
    stroke-width:${COLORING_STROKE} !important;
    paint-order:stroke fill;
  }

  /* Texto siempre negro */
  text, tspan { fill:#000 !important; stroke:none !important; }

  /* Excepciones ya previstas */
  .accent   { fill:#fff !important; stroke:#000 !important; stroke-width:${COLORING_STROKE} !important; paint-order:stroke fill; }
  .accent-2 { fill:#000 !important; stroke:none !important; }
  `
  doc.documentElement.appendChild(extra)

  return new XMLSerializer().serializeToString(doc)
}

/** Refuerza en DOM (no mueve nada): textos negros; accent/accent-2 conforme reglas */
function postDomFixes(svg: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')

  // Textos a negro, sin stroke (no tocamos x/y/transform)
  doc.querySelectorAll('text,tspan').forEach((t) => {
    t.setAttribute('fill', '#000000')
    t.removeAttribute('stroke')
    t.removeAttribute('stroke-width')
  })

  // .accent → blanco + trazo negro
  doc.querySelectorAll<SVGElement>('.accent').forEach((el) => {
    el.setAttribute('fill', '#ffffff')
    el.setAttribute('stroke', '#000000')
    if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', String(COLORING_STROKE))
    if (!el.getAttribute('paint-order')) el.setAttribute('paint-order', 'stroke fill')
  })

  // .accent-2 → negro sin trazo
  doc.querySelectorAll<SVGElement>('.accent-2').forEach((el) => {
    el.setAttribute('fill', '#000000')
    el.removeAttribute('stroke')
    el.removeAttribute('stroke-width')
    el.removeAttribute('paint-order')
  })

  return new XMLSerializer().serializeToString(doc)
}

/** Limpia pintura inline (atributos + style="") */
function scrubInlinePaint(el: SVGElement) {
  el.removeAttribute('fill')
  el.removeAttribute('stroke')
  el.removeAttribute('stroke-width')
  el.removeAttribute('paint-order')

  const s = el.getAttribute('style') || ''
  const s2 = s
    .replace(/(?:^|;)\s*(fill|stroke|stroke-width|paint-order)\s*:[^;]+;?/gi, '')
    .trim()
    .replace(/^;|;$/g, '')
  s2 ? el.setAttribute('style', s2) : el.removeAttribute('style')
}

/** Vectoriza el template: shapes en blanco+trazo negro; respeta .accent y .accent-2; elimina <image> */
function normalizeTemplateOutlinesRemoveImages(svgNoTextChange: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgNoTextChange, 'image/svg+xml')

  // El arte (imagen) se compone aparte; quítalo del template
  doc.querySelectorAll('image').forEach((n) => n.remove())
  // Quita estilos originales para asegurar prioridad
  doc.querySelectorAll('style').forEach((s) => s.remove())

  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line'
  doc.querySelectorAll<SVGElement>(SHAPES).forEach((el) => {
    scrubInlinePaint(el)
    if (el.classList.contains('accent')) {
      el.setAttribute('fill', '#ffffff')
      el.setAttribute('stroke', '#000000')
      if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', String(COLORING_STROKE))
      if (!el.getAttribute('paint-order')) el.setAttribute('paint-order', 'stroke fill')
    } else if (el.classList.contains('accent-2')) {
      el.setAttribute('fill', '#000000')
      el.removeAttribute('stroke')
      el.removeAttribute('stroke-width')
      el.removeAttribute('paint-order')
    } else {
      el.setAttribute('fill', '#ffffff')
      el.setAttribute('stroke', '#000000')
      if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', String(COLORING_STROKE))
      if (!el.getAttribute('paint-order')) el.setAttribute('paint-order', 'stroke fill')
    }
  })

  return new XMLSerializer().serializeToString(doc)
}

/** Extrae sólo el <image id="arte"> con su clipPath (si existe), conservando x/y/transform */
function buildArtOnlySvg(svgFilled: string): string {
  const parser = new DOMParser()
  const srcDoc = parser.parseFromString(svgFilled, 'image/svg+xml')
  const srcSvg = srcDoc.querySelector('svg') as SVGSVGElement | null
  if (!srcSvg) return ''

  const art = (srcDoc.querySelector('image#arte') || srcDoc.querySelector('image')) as SVGImageElement | null
  if (!art) return ''

  // Documento de salida mínimo
  const outDoc = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml')
  const outSvg = outDoc.querySelector('svg') as SVGSVGElement

  ;(['viewBox', 'width', 'height'] as const).forEach((a) => {
    if (srcSvg.hasAttribute(a)) outSvg.setAttribute(a, srcSvg.getAttribute(a)!)
  })

  const defs = outDoc.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const artMask = srcDoc.querySelector('clipPath#artMask')
  if (artMask) defs.appendChild(artMask.cloneNode(true))
  if (defs.childNodes.length) outSvg.appendChild(defs)

  const g = outDoc.createElementNS('http://www.w3.org/2000/svg', 'g')
  if (artMask) g.setAttribute('clip-path', 'url(#artMask)')

  const artClone = art.cloneNode(true) as SVGImageElement
  if (art.hasAttribute('preserveAspectRatio')) {
    artClone.setAttribute('preserveAspectRatio', art.getAttribute('preserveAspectRatio')!)
  }
  g.appendChild(artClone)
  outSvg.appendChild(g)

  return new XMLSerializer().serializeToString(outDoc)
}

/* ============================================================================ */
/*                        Detectores de contorno                                */
/* ============================================================================ */

/** Sobel en B/N para contornos del arte — fondo transparente, sólo bordes negros */
function sobelOutlineFromCanvas(srcCanvas: HTMLCanvasElement, threshold = 80): HTMLCanvasElement {
  const { width, height } = srcCanvas
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!
  const src = sctx.getImageData(0, 0, width, height).data

  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const r = src[i], g = src[i + 1], b = src[i + 2]
    gray[j] = (0.299 * r + 0.587 * g + 0.114 * b) | 0
  }

  // usamos Uint8ClampedArray si existe, si no, Uint8Array
  const edges = (typeof Uint8ClampedArray !== 'undefined'
    ? new Uint8ClampedArray(width * height)
    : new Uint8Array(width * height)) as Uint8Array

  const at = (x: number, y: number) => gray[y * width + x]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) +
        -2 * at(x - 1, y) + 2 * at(x + 1, y) +
        -at(x - 1, y + 1) + at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
         at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      const mag = Math.hypot(gx, gy)
      edges[y * width + x] = mag > threshold ? 0 : 255 // 0 = borde, 255 = fondo
    }
  }

  const dest = document.createElement('canvas')
  dest.width = width
  dest.height = height
  const dctx = dest.getContext('2d')!
  const img = dctx.createImageData(width, height)

  for (let i = 0, p = 0; i < edges.length; i++, p += 4) {
    const isEdge = edges[i] === 0
    img.data[p] = 0
    img.data[p + 1] = 0
    img.data[p + 2] = 0
    img.data[p + 3] = isEdge ? 255 : 0
  }
  dctx.putImageData(img, 0, 0)
  return dest
}

/** Canny en B/N: parámetros en ratios y grosor por dilatación */
function cannyOutlineFromCanvas(
  srcCanvas: HTMLCanvasElement,
  opts: { sigma?: number; low?: number; high?: number; thicknessPx?: number } = {}
): HTMLCanvasElement {
  const sigma = opts.sigma ?? 1.2
  const lowRatio = Math.max(0.01, Math.min(opts.low ?? 0.12, 0.95))
  const highRatio = Math.max(lowRatio + 0.01, Math.min(opts.high ?? 0.22, 0.9))
  const thickness = Math.max(1, Math.floor(opts.thicknessPx ?? 2))

  const { width, height } = srcCanvas
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!
  const srcData = sctx.getImageData(0, 0, width, height)
  const src = srcData.data

  // Grayscale
  const gray = new Float32Array(width * height)
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const r = src[i], g = src[i + 1], b = src[i + 2]
    gray[j] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  // Gaussian blur separable
  function makeKernel(s: number) {
    const r = Math.max(1, Math.floor(s * 3))
    const k = new Float32Array(2 * r + 1)
    const a = 1 / (Math.sqrt(2 * Math.PI) * s)
    const e = -1 / (2 * s * s)
    let sum = 0
    for (let i = -r; i <= r; i++) {
      const v = a * Math.exp(e * i * i)
      k[i + r] = v; sum += v
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum
    return { k, r }
  }
  function convolve1D_horz(inp: Float32Array, out: Float32Array, w: number, h: number, k: Float32Array, r: number) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) {
        let acc = 0
        for (let i = -r; i <= r; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i))
          acc += inp[row + xx] * k[i + r]
        }
        out[row + x] = acc
      }
    }
  }
  function convolve1D_vert(inp: Float32Array, out: Float32Array, w: number, h: number, k: Float32Array, r: number) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let acc = 0
        for (let i = -r; i <= r; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i))
          acc += inp[yy * w + x] * k[i + r]
        }
        out[y * w + x] = acc
      }
    }
  }
  const { k, r } = makeKernel(sigma)
  const tmp = new Float32Array(width * height)
  const blur = new Float32Array(width * height)
  convolve1D_horz(gray, tmp, width, height, k, r)
  convolve1D_vert(tmp, blur, width, height, k, r)

  // Gradiente (Sobel)
  const G = new Float32Array(width * height)
  const dir = new Uint8Array(width * height) // 0,1,2,3
  let gmax = 0
  const at = (x: number, y: number) => blur[y * width + x]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) +
        -2 * at(x - 1, y) + 2 * at(x + 1, y) +
        -at(x - 1, y + 1) + at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
         at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      const g = Math.hypot(gx, gy)
      G[y * width + x] = g
      if (g > gmax) gmax = g

      const a = Math.atan2(gy, gx) * 180 / Math.PI
      const ang = (a < 0 ? a + 180 : a)
      const bin = (ang < 22.5 || ang >= 157.5) ? 0 :
                  (ang < 67.5) ? 1 :
                  (ang < 112.5) ? 2 : 3
      dir[y * width + x] = bin
    }
  }

  // Non-maximum suppression
  const nms = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const d = dir[i]
      const g = G[i]
      let g1 = 0, g2 = 0
      if (d === 0) { g1 = G[i - 1];     g2 = G[i + 1] }
      else if (d === 1) { g1 = G[i - width + 1]; g2 = G[i + width - 1] }
      else if (d === 2) { g1 = G[i - width]; g2 = G[i + width] }
      else { g1 = G[i - width - 1]; g2 = G[i + width + 1] }
      nms[i] = (g >= g1 && g >= g2) ? g : 0
    }
  }

  // Umbrales con histéresis
  const high = highRatio * gmax
  const low  = lowRatio  * gmax
  const strong = 2, weak = 1, none = 0
  const mask = new Uint8Array(width * height)
  const stack: number[] = []

  for (let i = 0; i < nms.length; i++) {
    const v = nms[i]
    if (v >= high) { mask[i] = strong; stack.push(i) }
    else if (v >= low) { mask[i] = weak }
  }
  while (stack.length) {
    const i = stack.pop()!
    const y = (i / width) | 0, x = i - y * width
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const j = yy * width + xx
        if (mask[j] === weak) { mask[j] = strong; stack.push(j) }
      }
    }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i] !== strong) mask[i] = none

  // Grosor (dilatación t-1 veces)
  if (thickness > 1) {
    let cur = mask
    for (let n = 1; n < thickness; n++) {
      const out = new Uint8Array(width * height)
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x
          if (!cur[i]) continue
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) out[(y + dy) * width + (x + dx)] = strong
          }
        }
      }
      cur = out
    }
    mask.set(cur)
  }

  // Canvas salida (negro sobre alpha)
  const dest = document.createElement('canvas')
  dest.width = width; dest.height = height
  const dctx = dest.getContext('2d')!
  const out = dctx.createImageData(width, height)
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const e = mask[i] === strong
    out.data[p] = 0; out.data[p + 1] = 0; out.data[p + 2] = 0
    out.data[p + 3] = e ? 255 : 0
  }
  dctx.putImageData(out, 0, 0)
  return dest
}

/* ============================================================================ */
/*                                Export normal                                 */
/* ============================================================================ */

export async function exportCurrentCardPng(
  templateSvg: string,
  dpi: number,
  card: Card,
  scale = 2,
  fit?: ArtFitParam
) {
  const effDpi = Math.max(1, scale) * dpi
  const widthPx = Math.round((65 / 25.4) * effDpi)
  const heightPx = Math.round((92 / 25.4) * effDpi)

  const artFit = resolveFit(fit, card)
  const filled = fillTemplate(templateSvg, mapCardToTemplateVars(card) as any, { artFit })
  const hiRes = ensureSvgSize(filled, widthPx, heightPx)

  const dataUrl = await svgToPng(hiRes, widthPx, heightPx)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${(card.set_code || 'BR')}_${safe(card.nombre)}_${effDpi}dpi.png`
  a.click()
}

export async function exportSheetPdf(
  cards: Card[],
  templateSvg: string,
  _sheet: 'A4',
  dpi: number,
  scale = 2,
  fit?: ArtFitParam
) {
  const effDpi = Math.max(1, scale) * dpi
  const doc = await PDFDocument.create()
  const A4_W = 210 * MM_TO_PT, A4_H = 297 * MM_TO_PT
  const page = doc.addPage([A4_W, A4_H])

  const cols = 3, rows = 3
  const cardWmm = 65, cardHmm = 92, gutterMm = 2
  const gridW = cols * cardWmm + (cols - 1) * gutterMm
  const gridH = rows * cardHmm + (rows - 1) * gutterMm
  const startXmm = (210 - gridW) / 2, startYmm = (297 - gridH) / 2

  const list = new Array(rows * cols).fill(0).map((_, i) => cards[i % cards.length])

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const card = list[i]
      const artFit = resolveFit(fit, card)
      const svg0 = fillTemplate(templateSvg, mapCardToTemplateVars(card) as any, { artFit })
      const wpx = Math.round((cardWmm / 25.4) * effDpi)
      const hpx = Math.round((cardHmm / 25.4) * effDpi)
      const hiRes = ensureSvgSize(svg0, wpx, hpx)

      const dataUrl = await svgToPng(hiRes, wpx, hpx)
      const imgBytes = await dataUrlToBytes(dataUrl)
      const img = await doc.embedPng(imgBytes)
      page.drawImage(img, {
        x: (startXmm + c * (cardWmm + gutterMm)) * MM_TO_PT,
        y: (startYmm + (rows - 1 - r) * (cardHmm + gutterMm)) * MM_TO_PT,
        width: cardWmm * MM_TO_PT,
        height: cardHmm * MM_TO_PT
      })
    }
  }

  const bytes = await doc.save();
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const blob  = new Blob([view], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'planilla_3x3_A4.pdf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ============================================================================ */
/*                      Export PDF 3×3 “para colorear”                           */
/* ============================================================================ */

export async function exportSheetPdfColoring(
  cards: Card[],
  templateSvg: string,
  _sheet: 'A4',
  dpi: number,
  scale = 2,
  fit?: ArtFitParam,
  canny: { sigma?: number; low?: number; high?: number; thicknessPx?: number } = {}
) {
  const effDpi = Math.max(1, scale) * dpi
  const doc = await PDFDocument.create()
  const A4_W = 210 * MM_TO_PT, A4_H = 297 * MM_TO_PT
  const page = doc.addPage([A4_W, A4_H])

  const cols = 3, rows = 3, cardWmm = 65, cardHmm = 92, gutterMm = 2
  const gridW = cols * cardWmm + (cols - 1) * gutterMm
  const gridH = rows * cardHmm + (rows - 1) * gutterMm
  const startXmm = (210 - gridW) / 2, startYmm = (297 - gridH) / 2

  const list = new Array(rows * cols).fill(0).map((_, i) => cards[i % cards.length])

  const renders = await Promise.all(
    list.map(async (card) => {
      const wpx = Math.round((cardWmm / 25.4) * effDpi)
      const hpx = Math.round((cardHmm / 25.4) * effDpi)

      const artFit = resolveFit(fit, card)

      // Template lleno (con datos) y a tamaño final
      const svgFilled = fillTemplate(templateSvg, mapCardToTemplateVars(card) as any, { artFit })
      const sized = ensureSvgSize(svgFilled, wpx, hpx)

      // 1) CSS parchado
      const styled = patchStyleForColoring(sized)
      // 2) Refuerzos en DOM
      const styledFixed = postDomFixes(styled)
      // 3) Vector del template (sin <image>)
      const vectorSvg = normalizeTemplateOutlinesRemoveImages(styledFixed)

      // 4) Arte solo (mismo x/y/transform) → CANNY
      const artSvg = buildArtOnlySvg(sized)
      const artCanvas = artSvg
        ? await svgToCanvas(artSvg, wpx, hpx)
        : (() => { const c = document.createElement('canvas'); c.width = wpx; c.height = hpx; return c })()

      const { sigma = 1.2, high = 0.22, low = Math.min(0.95 * high, 0.6 * high), thicknessPx = 2 } = canny
      const artEdges = artSvg
        ? cannyOutlineFromCanvas(artCanvas, { sigma, low, high, thicknessPx })
        : artCanvas

      // 5) Composición final B/N
      const vectorSvgSized = ensureSvgSize(vectorSvg, wpx, hpx)
      const vecCanvas = await svgToCanvas(vectorSvgSized, wpx, hpx)

      const combo = document.createElement('canvas')
      combo.width = wpx
      combo.height = hpx
      const ctx = combo.getContext('2d')!
      ctx.imageSmoothingEnabled = false // contornos nítidos
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, wpx, hpx) // fondo blanco del para-colorear
      ctx.drawImage(vecCanvas, 0, 0)
      if (artSvg) ctx.drawImage(artEdges, 0, 0)

      const dataUrl = combo.toDataURL('image/png')
      const bytes = await dataUrlToBytes(dataUrl)
      return await doc.embedPng(bytes)
    })
  )

  // Grilla 3×3
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const img = renders[k++]
      page.drawImage(img, {
        x: (startXmm + c * (cardWmm + gutterMm)) * MM_TO_PT,
        y: (startYmm + (rows - 1 - r) * (cardHmm + gutterMm)) * MM_TO_PT,
        width: cardWmm * MM_TO_PT,
        height: cardHmm * MM_TO_PT
      })
    }
  }

  const bytes = await doc.save();
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const blob  = new Blob([view], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'planilla_3x3_colorear.pdf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ============================================================================ */
/*                 PNG “para colorear” — Carta actual                           */
/* ============================================================================ */

export async function exportCurrentCardPngColoring(
  templateSvg: string,
  dpi: number,
  card: Card,
  scale = 2,
  fit?: ArtFitParam,
  canny: { sigma?: number; low?: number; high?: number; thicknessPx?: number } = {}
) {
  const effDpi = Math.max(1, scale) * dpi
  const widthPx = Math.round((65 / 25.4) * effDpi)
  const heightPx = Math.round((92 / 25.4) * effDpi)

  const artFit = resolveFit(fit, card)
  const filled = fillTemplate(templateSvg, mapCardToTemplateVars(card) as any, { artFit })
  const sized = ensureSvgSize(filled, widthPx, heightPx)

  const styled = patchStyleForColoring(sized)
  const styledFixed = postDomFixes(styled)
  const vectorSvg = normalizeTemplateOutlinesRemoveImages(styledFixed)

  const artSvg = buildArtOnlySvg(sized)
  const artCanvas = artSvg
    ? await svgToCanvas(artSvg, widthPx, heightPx)
    : (() => { const c = document.createElement('canvas'); c.width = widthPx; c.height = heightPx; return c })()

  const { sigma = 1.2, high = 0.22, low = Math.min(0.95 * high, 0.6 * high), thicknessPx = 2 } = canny
  const edges = artSvg
    ? cannyOutlineFromCanvas(artCanvas, { sigma, low, high, thicknessPx })
    : artCanvas

  const vectorSvgSized = ensureSvgSize(vectorSvg, widthPx, heightPx)
  const vecCanvas = await svgToCanvas(vectorSvgSized, widthPx, heightPx)

  const combo = document.createElement('canvas')
  combo.width = widthPx; combo.height = heightPx
  const ctx = combo.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.drawImage(vecCanvas, 0, 0)
  if (artSvg) ctx.drawImage(edges, 0, 0)

  const dataUrl = combo.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${(card.set_code || 'BR')}_${safe(card.nombre)}_colorear_${effDpi}dpi.png`
  a.click()
}

/* ============================================================================ */
/*          PDF 3×3 (normal) — usando template por CADA carta                   */
/* ============================================================================ */

export async function exportSheetPdfPerTemplate(
  cards: Card[],
  getTemplate: (c: Card) => string, // devuelve el SVG del template elegido por carta
  _sheet: 'A4',
  dpi: number,
  scale = 2,
  fit?: ArtFitParam
) {
  const effDpi = Math.max(1, scale) * dpi
  const doc = await PDFDocument.create()
  const A4_W = 210 * MM_TO_PT, A4_H = 297 * MM_TO_PT
  const page = doc.addPage([A4_W, A4_H])

  const cols = 3, rows = 3, cardWmm = 65, cardHmm = 92, gutterMm = 2
  const gridW = cols * cardWmm + (cols - 1) * gutterMm
  const gridH = rows * cardHmm + (rows - 1) * gutterMm
  const startXmm = (210 - gridW) / 2, startYmm = (297 - gridH) / 2

  const list = new Array(rows * cols).fill(0).map((_, i) => cards[i % cards.length])

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const card = list[i]
      const tpl = getTemplate(card)

      const wpx = Math.round((cardWmm / 25.4) * effDpi)
      const hpx = Math.round((cardHmm / 25.4) * effDpi)

      const artFit = resolveFit(fit, card)
      const svg0 = fillTemplate(tpl, mapCardToTemplateVars(card) as any, { artFit })
      const hiRes = ensureSvgSize(svg0, wpx, hpx)

      const dataUrl = await svgToPng(hiRes, wpx, hpx)
      const imgBytes = await dataUrlToBytes(dataUrl)
      const img = await doc.embedPng(imgBytes)
      page.drawImage(img, {
        x: (startXmm + c * (cardWmm + gutterMm)) * MM_TO_PT,
        y: (startYmm + (rows - 1 - r) * (cardHmm + gutterMm)) * MM_TO_PT,
        width: cardWmm * MM_TO_PT,
        height: cardHmm * MM_TO_PT
      })
    }
  }

  const bytes = await doc.save();
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const blob  = new Blob([view], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'planilla_3x3_A4_por_template.pdf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
