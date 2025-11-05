// TemplateRenderer.ts
// Utilidades para cargar una plantilla SVG y rellenarla con datos de la carta

// ───────────────────────────────────────────────────────────────────────────────
// Cache simple de plantillas
// ───────────────────────────────────────────────────────────────────────────────
let cache: Record<string, string> = {}

export async function loadTemplate(path: string): Promise<string> {
  if (cache[path]) return cache[path]
  const res = await fetch(path)
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla: ${path}`)
  const text = await res.text()
  cache[path] = text
  return text
}

// ───────────────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────────────
export type FitMode = 'contain' | 'cover'
export type ArtFit = FitMode | 'stretch'

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function computeIconosTextFromCard(card: Record<string, any>) {
  const el = (card.elemento ?? '').toString().trim()
  const rz = (card.rareza ?? '').toString().trim()
  return [el, rz].filter(Boolean).join(' · ')
}

// Mide texto en px usando un canvas temporal (en el navegador)
function measureTextPx(text: string, opts: { fontFamily: string; fontSize: number; fontWeight?: number }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const weight = opts.fontWeight ? String(opts.fontWeight) : 'normal'
  ctx.font = `${weight} ${opts.fontSize}px ${opts.fontFamily}`
  return ctx.measureText(text).width
}

/**
 * Devuelve markup SVG con múltiples <tspan> envueltos por palabras (según ancho en px).
 * Úsalo dentro de un <text>…{{texto_efecto_wrapped}}…</text> del template.
 */
export function wrapToTspans(
  text: string,
  opts: { maxWidth: number; fontFamily?: string; fontSize?: number; lineHeight?: number; fontWeight?: number }
) {
  const fontFamily = opts.fontFamily ?? 'Inter, sans-serif'
  const fontSize = Math.max(1, opts.fontSize ?? 14)
  const lineHeight = Math.max(fontSize, opts.lineHeight ?? 18) // px
  const fontWeight = opts.fontWeight ?? 600

  // Permite saltos manuales con \n
  const rawLines = String(text ?? '').split(/\n/g)
  const out: string[] = []

  for (let idx = 0; idx < rawLines.length; idx++) {
    const words = rawLines[idx].split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const probe = line ? line + ' ' + w : w
      const width = measureTextPx(probe, { fontFamily, fontSize, fontWeight })
      if (width <= opts.maxWidth) {
        line = probe
      } else {
        // volcar línea actual
        out.push(`<tspan x="0" dy="${out.length === 0 && idx === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`) // primera línea sin desplazamiento adicional
        line = w
      }
    }
    // última de ese bloque
    out.push(`<tspan x="0" dy="${out.length === 0 && idx === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
  }

  // Evita tspan vacío en textos vacíos
  if (out.length === 0) {
    out.push(`<tspan x="0" dy="0"></tspan>`)
  }

  return out.join('')
}

// ───────────────────────────────────────────────────────────────────────────────
// Ajuste de arte: contain / cover / stretch
// ───────────────────────────────────────────────────────────────────────────────
export function setArtFit(svg: string, mode: ArtFit): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')

    const value = mode === 'contain' ? 'xMidYMid meet' : mode === 'cover' ? 'xMidYMid slice' : 'none'

    let img = doc.querySelector('image#arte, image.arte') as SVGImageElement | null
    if (!img) {
      img = Array.from(doc.querySelectorAll('image')).find((el) => {
        const href = (el.getAttribute('href') || el.getAttribute('xlink:href') || '')
        return href.includes('{{arte_path}}')
      }) as SVGImageElement | null
    }
    if (!img) img = doc.querySelector('image') as SVGImageElement | null

    if (img) img.setAttribute('preserveAspectRatio', value)

    const serializer = new XMLSerializer()
    return serializer.serializeToString(doc)
  } catch {
    // si DOMParser falla (SSR?), devuelve el svg original
    return svg
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Relleno de plantilla
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Sustituye {{token}} por valores del objeto "card" dentro del SVG.
 * - Escapa XML por defecto.
 * - Para tokens de markup (RAW_KEYS), inyecta tal cual (sin escapar), p.ej. tspans.
 * - Ajusta el arte con setArtFit.
 */
export function fillTemplate(
  template: string,
  card: Record<string, any>,
  opts?: { artFit?: ArtFit }
): string {
  let svg = template

  // 1) Prepara texto envuelto
  const efectoWrapped = wrapToTspans(card.texto_efecto ?? card.efecto ?? '', {
    maxWidth: 538,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 600,
  })

  // 2) Tokens finales
  const tokens: Record<string, any> = {
    ...card,
    iconos_text:
      card.iconos_text ?? (Array.isArray(card.iconos) ? card.iconos.join(' · ') : computeIconosTextFromCard(card)),
    texto_efecto_wrapped: card.texto_efecto_wrapped ?? efectoWrapped,
  }

  // 3) Reemplazos (dos pasadas: normal y RAW)
  const RAW_KEYS = new Set(['texto_efecto_wrapped'])

  // 3.1. Tokens normales: escapa XML
  for (const [k, v] of Object.entries(tokens)) {
    if (RAW_KEYS.has(k)) continue
    const re = new RegExp(`{{\\s*${escapeRegExp(k)}\\s*}}`, 'g')
    const val = v == null ? '' : String(v)
    svg = svg.replace(re, escapeXml(val))
  }

  // 3.2. Tokens RAW: inyecta tal cual
  for (const k of RAW_KEYS) {
    if (!(k in tokens)) continue
    const re = new RegExp(`{{\\s*${escapeRegExp(k)}\\s*}}`, 'g')
    const raw = tokens[k] == null ? '' : String(tokens[k])
    svg = svg.replace(re, raw)
  }

  // 4) Ajuste de arte
  svg = setArtFit(svg, (opts?.artFit as ArtFit) ?? 'contain')

  return svg
}
