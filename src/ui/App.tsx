// src/ui/App.tsx
import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import Header from './Header'
import NewIdeas from './NewIdeas'
import PrintPreview from './PrintPreview'
import { fillTemplate, type ArtFit } from '../utils/TemplateRenderer'
import {
  exportCurrentCardPng,
  exportCurrentCardPngColoring,
  exportSheetPdfColoring,
  exportSheetPdfPerTemplate,
} from '../utils/Exporters'
import TemplateSelector from './TemplateSelector'
import { parseCsv, toCsv } from '../utils/csv'
import { parseSvgTitle, TemplateInfo , slugify } from '../utils/Templates'
import type { Card } from '../utils/types'

const templateMods = import.meta.glob('./templates/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type TemplateOpt = { id: string; name: string; svg: string };

// ───────────────────────────────────────────────────────────────────────────────
// Helpers UI (solo presentación; no cambian la lógica)
// ───────────────────────────────────────────────────────────────────────────────
function cx(...a: Array<string | false | undefined>) { return a.filter(Boolean).join(' ') }

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-800 mb-2">{children}</h3>
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 mt-1">{children}</p>
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'px-3 py-1.5 rounded-full border transition text-sm',
        active ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-white hover:bg-slate-50'
      )}
    >
      {children}
    </button>
  )
}
function Stepper({
  value, onChange, min = 0, max = 9999, step = 1, inputProps = {},
}: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
}) {
  const dec = () => onChange(Math.max(min, (value || 0) - step))
  const inc = () => onChange(Math.min(max, (value || 0) + step))
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={dec} className="px-2 py-1.5 rounded-lg border bg-white hover:bg-slate-50" aria-label="Disminuir">–</button>
      <input
        type="number"
        className="w-full px-3 py-2 rounded-lg border text-center"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        min={min} max={max} step={step} {...inputProps}
      />
      <button type="button" onClick={inc} className="px-2 py-1.5 rounded-lg border bg-white hover:bg-slate-50" aria-label="Aumentar">+</button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Datos base y mapeo → tokens del SVG
// ───────────────────────────────────────────────────────────────────────────────
const MAX_CARDS = 9
const DEFAULT_TEMPLATE_PATH = '/templates/Plantillas_brainroots_card.svg' // fallback legacy

const DEMO: Card = {
  nombre: 'Tralalero tralala',
  elemento: 'Tierra',
  rareza: 'Legendaria',
  set_code: 'BR-001',
  autor: 'Brainroots Studio',
  hp: 600,
  atk: 1800,
  def: 1200,
  poder1: 'Eco Mental',
  poder2: 'Convergencia',
  especial: 'Resonancia',
  costo: 3,
  efecto: '',
  arte_path: '',
} as any

function computeIconosText(c: Partial<Card>) {
  const el = (c.elemento || '').toString().trim()
  const rz = (c.rareza || '').toString().trim()
  return [el, rz].filter(Boolean).join(' · ')
}
export function mapCardToTemplateVars(card: Card) {
  const iconos = computeIconosText(card)
  return {
    ...card,
    tipo: (card as any).tipo ?? card.elemento,
    ataque: (card as any).ataque ?? (card as any).atk,
    defensa: (card as any).defensa ?? (card as any).def,
    poder_1: (card as any).poder_1 ?? (card as any).poder1,
    poder_2: (card as any).poder_2 ?? (card as any).poder2,
    poder_especial: (card as any).poder_especial ?? (card as any).especial,
    texto_efecto: (card as any).texto_efecto ?? (card as any).efecto ?? '',
    texto_efecto_wrapped: (card as any).texto_efecto_wrapped ?? (card as any).efecto ?? '',
    iconos_text: iconos, IconosText: iconos, iconosText: iconos,
  }
}
// Fuerza SVG responsive: width/height 100%, viewBox si falta, y aspecto centrado
function makeResponsiveSvg(svg: string) {
  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
    const orig = String(attrs)
    let a = orig.replace(/\swidth="[^"]*"/i, '').replace(/\sheight="[^"]*"/i, '')

    // si no tiene viewBox, lo generamos a partir de width/height o fallback
    if (!/viewBox=/i.test(a)) {
      const wM = /\bwidth="([\d.]+)(px)?"/i.exec(orig)
      const hM = /\bheight="([\d.]+)(px)?"/i.exec(orig)
      const w = wM ? parseFloat(wM[1]) : 650
      const h = hM ? parseFloat(hM[1]) : 920
      a += ` viewBox="0 0 ${w} ${h}"`
    }

    if (!/preserveAspectRatio=/i.test(a)) {
      a += ` preserveAspectRatio="xMidYMid meet"`
    }

    return `<svg${a} width="100%" height="100%">`
  })
}
// ───────────────────────────────────────────────────────────────────────────────
// Guía rápida (Overlay)
// ───────────────────────────────────────────────────────────────────────────────
const ONBOARDING_KEY = 'onboardingDismissedV1'
function QuickGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Guía rápida (3 pasos)</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border hover:bg-slate-50" aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="p-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="text-3xl mb-2">🎨</div>
            <h3 className="font-semibold mb-1">1. Sube tu arte</h3>
            <p className="text-sm text-slate-600">Arrastra una imagen a la vista previa o usa “Arte → Subir”.</p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-3xl mb-2">✍️</div>
            <h3 className="font-semibold mb-1">2. Pon nombre y poderes</h3>
            <p className="text-sm text-slate-600">Elige <b>Elemento</b> y <b>Rareza</b>; ajusta HP/ATK/DEF con ±.</p>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-3xl mb-2">📦</div>
            <h3 className="font-semibold mb-1">3. Exporta</h3>
            <p className="text-sm text-slate-600">Descarga PNG individual o PDF (3×3) listo para imprimir.</p>
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-wrap items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow">¡Empezar!</button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border hover:bg-slate-50">Ver más tarde</button>
          <p className="text-xs text-slate-500">Puedes reabrirla desde “Ayuda & Guía”.</p>
        </div>
      </div>
    </div>
    
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// App principal
// ───────────────────────────────────────────────────────────────────────────────
export default function App() {

  // ───────────────────────────────────────────────────────────────────────────────
// Plantillas embebidas (ruta: src/ui/templates/*.svg) — NO cambiar
// ───────────────────────────────────────────────────────────────────────────────

  const [cards, setCards] = useState<Card[]>([DEMO])
  const [selected, setSelected] = useState(0)

  const [templates, setTemplates] = useState<TemplateOpt[]>([])

  const [dpi, setDpi] = useState(300)
  const [scale, setScale] = useState(2) // export

  const [mode, setMode] = useState<'experto' | 'niño'>('experto')
  const kidMode = mode === 'niño'

  const [history, setHistory] = useState<Card[][]>([])
  const pushHistory = () => setHistory((h) => [...h, cards.map((c) => ({ ...c }))])
    

  // Historial para deshacer/rehacer
const [past, setPast] = React.useState<Card[][]>([])
const [future, setFuture] = React.useState<Card[][]>([])

const snapshot = React.useCallback(() => {
  // Guarda un snapshot del estado actual antes de modificar
  setPast((p) => [...p, cards.map((c) => ({ ...c }))])
  setFuture([]) // cualquier cambio invalida el stack de rehacer
}, [cards])

const undo = React.useCallback(() => {
  setPast((p) => {
    if (p.length === 0) return p
    const prev = p[p.length - 1]
    setFuture((f) => [...f, cards.map((c) => ({ ...c }))])
    setCards(prev)
    return p.slice(0, -1)
  })
}, [cards])

const redo = React.useCallback(() => {
  setFuture((f) => {
    if (f.length === 0) return f
    const next = f[f.length - 1]
    setPast((p) => [...p, cards.map((c) => ({ ...c }))])
    setCards(next)
    return f.slice(0, -1)
  })
}, [cards])

const current = cards[selected] || null

const currentTplSvg =
  templates.find(t => t.id === (current as any)?.template_id)?.svg
  ?? templates[0]?.svg
  ?? ''

// Reemplaza tu clearCurrent por este
const clearCurrent = React.useCallback(() => {
  const cur = cards[selected]
  if (!cur) return
  if (!window.confirm('¿Limpiar todos los campos de esta carta?')) return
  snapshot()
  setCards((prev) =>
    prev.map((c, i) =>
      i === selected
        ? ({
            // preservados
            set_code: c.set_code || '',
            template_id: (c as any).template_id,
            art_fit: ((c as any).art_fit ?? 'contain') as any,
            elemento: c.elemento || 'Tierra',
            rareza: c.rareza || 'Común',
            // limpiados
            nombre: '',
            hp: 0, atk: 0, def: 0, costo: 0,
            poder1: '', poder2: '', especial: '',
            autor: '',
            efecto: '', texto_efecto: '',
            arte_path: '',
          } as any)
        : c
    )
  )
}, [current, selected, snapshot])


  // Guía rápida
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try { return localStorage.getItem(ONBOARDING_KEY) !== '1' } catch { return true }
  })
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const closeGuide = () => { try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {} ; setShowGuide(false) }

  // Cargar plantillas embebidas (src/ui/templates)
useEffect(() => {
  const list: TemplateOpt[] = Object.entries(templateMods)
    .map(([path, svg]) => {
      const id = path.split('/').pop()!.replace(/\.svg$/i, '')
      return { id, name: id, svg }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  setTemplates(list)

  // Nuevo: plantilla por defecto al iniciar
if (list.length) {
  setCards(prev =>
    prev.map(c => ({ ...c, template_id: (c as any).template_id ?? list[0].id } as any))
  )
}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

  const artFit: ArtFit = ((current as any)?.art_fit ?? 'contain') as ArtFit
  const mutateCard = (index: number, patch: Partial<Card>) => {
    snapshot()
    setCards((prev) => prev.map((c, i) => (i === index ? ({ ...c, ...patch } as Card) : c)))
  }

  function addCard() {
    if (cards.length >= MAX_CARDS) { alert('Máximo 9 cartas por hoja (A4 3×3).'); return }
    pushHistory()
    setCards((prev) => [
      ...prev,
      { ...DEMO, nombre: `Nueva carta ${prev.length + 1}`, set_code: `BR-${String(prev.length + 1).padStart(3, '0')}` } as any,
    ])
    setSelected(cards.length)
    // si el usuario crea algo, ocultar guía
    if (showGuide) closeGuide()
  }

  async function importCsvFromFile(file: File) {
    const rows = await parseCsv(file)
    if (!Array.isArray(rows) || !rows.length) { alert('CSV vacío o inválido'); return }
    pushHistory()
    setCards(rows.slice(0, MAX_CARDS) as Card[])
    setSelected(0)
    if (showGuide) closeGuide()
  }

  async function onImportSvg(file: File) {
    const svg = await file.text()
    const fileBase = file.name.replace(/\.svg$/i, '')
    const name = parseSvgTitle(svg) ?? fileBase
    let idBase = slugify(name)
    if (!idBase) idBase = slugify(fileBase) || `tpl-${Date.now()}`
    // evita colisiones de id
    let id = idBase
    let n = 2
    while (templates.some(t => t.id === id)) {
      id = `${idBase}-${n++}`
    }

    setTemplates(prev => [...prev, { id, name, svg }])

    if (current) {
      mutateCard(selected, { template_id: id } as any)
    }
  }
    
  function exportCsvFile() {
    const csv = toCsv(cards as any)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'brainroots_cards.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 800)
  }

  // Render del SVG con los mismos tokens que usan los exportadores
const svg = useMemo(() => {
  if (!current) return ''
  const tplSvg =
    templates.find(t => t.id === (current as any).template_id)?.svg
    ?? templates[0]?.svg
    ?? ''
  try {
    return fillTemplate(tplSvg, mapCardToTemplateVars(current) as any, { artFit })
  } catch {
    return ''
  }
}, [templates, current, artFit])

  // Tamaño base del SVG
  const [svgSize, setSvgSize] = useState({ w: 650, h: 920 })
  useEffect(() => {
    if (!svg) return
    const vb = svg.match(/viewBox="([\d.\s]+)"/i)
    if (vb) {
      const n = vb[1].trim().split(/\s+/).map(Number)
      if (n.length === 4) setSvgSize({ w: n[2], h: n[3] })
      return
    }
    const mw = svg.match(/\bwidth="([\d.]+)(px)?"/i)
    const mh = svg.match(/\bheight="([\d.]+)(px)?"/i)
    if (mw && mh) setSvgSize({ w: parseFloat(mw[1]!), h: parseFloat(mh[1]!) })
  }, [svg])


  

  const svgResponsive = useMemo(() => (svg ? makeResponsiveSvg(svg) : ''), [svg])

  // Vista previa (sin scroll), conservando tu límite de escala


  // Drag & Drop arte en preview
  const onDropPreview: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (!f || !current) return
    const fr = new FileReader()
    fr.onload = () => mutateCard(selected, { arte_path: String(fr.result) } as any)
    fr.readAsDataURL(f)
    if (showGuide) closeGuide()
  }

  const hasArt = Boolean(current?.arte_path)
  const atLeastOneArt = cards.some((c) => c?.arte_path)

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      <Header />
      {/* Topbar */}
      <div className="flex items-center gap-2 mb-3 mt-4">
        <label className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 cursor-pointer">
          Importar CSV
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0] || e.currentTarget.files?.[0]; if (!f) return; await importCsvFromFile(f); e.currentTarget.value = '' }}
          />
        </label>
        <button className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50" onClick={exportCsvFile}>Exportar CSV</button>
        <button
          className={cx('px-3 py-2 rounded-lg text-white', cards.length >= MAX_CARDS ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600')}
          onClick={addCard} disabled={cards.length >= MAX_CARDS}
        >
          + Nueva
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg border hover:bg-slate-50" onClick={() => setShowGuide(true)}>Ayuda & Guía</button>

          {/* Modo (renombrado en UI; valores internos iguales) */}
          <div className="flex rounded-xl border overflow-hidden">
            <button
              type="button" onClick={() => setMode('experto')}
              className={cx('px-3 py-2 text-sm', mode === 'experto' ? 'bg-slate-900 text-white' : 'bg-white')}
              title="Modo Adulto"
            >Adulto</button>
            <button
              type="button" onClick={() => setMode('niño')}
              className={cx('px-3 py-2 text-sm', mode === 'niño' ? 'bg-slate-900 text-white' : 'bg-white')}
              title="Modo Niños"
            >Niños</button>
          </div>
        </div>
      </div>

{/* Listado (izquierda) */}
<section className="xl:col-span-4 order-3 xl:order-1">
  <div className="text-slate-800 font-semibold mb-1">Listado de Cartas (Puedes crear 9 cartas por sesión)</div>

  <div className="rounded-xl border overflow-auto">
    {(() => {
      const showAdvanced = mode === 'experto' // Adulto
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              {/* 👉 El ORDEN DEL HEADER COINCIDE 1:1 CON LAS CELDAS DE LAS FILAS */}
              <th className="p-2 w-10">#</th>
              <th className="p-2 w-14">Imagen</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 hidden sm:table-cell">Elemento</th>
              <th className="p-2 hidden md:table-cell">Rareza</th>
              <th className="p-2 w-16 text-center hidden lg:table-cell">ATK</th>
              <th className="p-2 w-16 text-center hidden xl:table-cell">DEF</th>
              <th className="p-2 w-16 text-center hidden lg:table-cell">HP</th>
              <th className="p-2 w-16 text-center hidden xl:table-cell">Costo</th>
              {showAdvanced && <th className="p-2 hidden 2xl:table-cell">Autor</th>}
              {showAdvanced && <th className="p-2 hidden 2xl:table-cell">Efecto</th>}
              <th className="p-2 w-24 hidden sm:table-cell">Código</th>
              <th className="p-2 w-16 text-center">Eliminar</th>
            </tr>
          </thead>

          <tbody>
            {cards.map((c, i) => {
              const efecto = (c as any).efecto || (c as any).texto_efecto || ''
              return (
                <tr
                  key={i}
                  className={(i === selected ? 'bg-emerald-50/60' : 'bg-white hover:bg-slate-50') + ' border-t cursor-pointer'}
                  onClick={() => setSelected(i)}
                >
                  {/* 👉 MISMO ORDEN DE CELDAS QUE EL HEADER */}
                  <td className="p-2 text-center">{i + 1}</td>

                  <td className="p-2">
                    {(c as any).arte_path
                      ? <img src={(c as any).arte_path as any} alt="" className="h-10 w-10 object-cover rounded-md border" />
                      : <div className="h-10 w-10 rounded-md border grid place-items-center text-slate-400">🖼️</div>}
                  </td>

                  <td className="p-2">
                    <input
                      className="w-full px-2 py-1 rounded border"
                      value={c.nombre || ''}
                      onChange={(e) => mutateCard(i, { nombre: e.target.value } as any)}
                    />
                  </td>

                  <td className="p-2 hidden sm:table-cell">
                    <select
                      className="w-full px-2 py-1 rounded border bg-white"
                      value={c.elemento || 'Tierra'}
                      onChange={(e) => mutateCard(i, { elemento: e.target.value } as any)}
                    >
                      <option value="Tierra">Tierra</option>
                      <option value="Agua">Agua</option>
                      <option value="Fuego">Fuego</option>
                      <option value="Aire">Aire</option>
                      <option value="Mente">Mente</option>
                    </select>
                  </td>

                  <td className="p-2 hidden md:table-cell">
                    <select
                      className="w-full px-2 py-1 rounded border bg-white"
                      value={c.rareza || 'Común'}
                      onChange={(e) => mutateCard(i, { rareza: e.target.value } as any)}
                    >
                      <option>Común</option>
                      <option>Rara</option>
                      <option>Épica</option>
                      <option>Legendaria</option>
                      <option>Mítica</option>
                    </select>
                  </td>


                  <td className="p-2 text-right hidden lg:table-cell">
                    <input
                      type="number"
                      className="w-20 px-2 py-1 rounded border text-right"
                      value={Number((c as any).atk || 0)}
                      onChange={(e) => mutateCard(i, { atk: Number(e.target.value || 0) } as any)}
                    />
                  </td>

                  <td className="p-2 text-right hidden xl:table-cell">
                    <input
                      type="number"
                      className="w-20 px-2 py-1 rounded border text-right"
                      value={Number((c as any).def || 0)}
                      onChange={(e) => mutateCard(i, { def: Number(e.target.value || 0) } as any)}
                    />
                  </td>

                  <td className="p-2 text-right hidden lg:table-cell">
                    <input
                      type="number"
                      className="w-20 px-2 py-1 rounded border text-right"
                      value={Number((c as any).hp || 0)}
                      onChange={(e) => mutateCard(i, { hp: Number(e.target.value || 0) } as any)}
                    />
                  </td>

                  <td className="p-2 text-right hidden xl:table-cell">
                    <input
                      type="number"
                      className="w-20 px-2 py-1 rounded border text-right"
                      value={Number((c as any).costo || 0)}
                      onChange={(e) => mutateCard(i, { costo: Number(e.target.value || 0) } as any)}
                    />
                  </td>

                  {showAdvanced && (
                    <td className="p-2 hidden 2xl:table-cell">
                      <input
                        className="w-full px-2 py-1 rounded border"
                        value={(c as any).autor || ''}
                        onChange={(e) => mutateCard(i, { autor: e.target.value } as any)}
                      />
                    </td>
                  )}

                  {showAdvanced && (
                    <td className="p-2 hidden 2xl:table-cell">
                      <div className="truncate max-w-[14rem]" title={efecto}>
                        {efecto || '—'}
                      </div>
                    </td>
                  )}

                  <td className="p-2 hidden sm:table-cell">
                    <input
                      className="w-full px-2 py-1 rounded border"
                      value={c.set_code || ''}
                      onChange={(e) => mutateCard(i, { set_code: e.target.value } as any)}
                    />
                  </td>

                  <td className="p-2 text-center">
                    <button
                      className="px-2 py-1 rounded bg-rose-600 text-white"
                      title="Eliminar carta"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        snapshot() // ← para poder deshacer
                        setCards((prev) => prev.filter((_, idx) => idx !== i))
                        if (selected >= i && selected > 0) setSelected((s) => s - 1)
                      }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )
    })()}
  </div>
</section> <br />

      {/* Grid principal (12 cols): Listado · Vista previa · Editor+Preferencias */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Editor + Preferencias (derecha, sticky) */}
        <aside className="lg:col-span-7 order-2 lg:order-1">
          <div className="sticky top-4 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-3">
              <SectionTitle>Editar carta</SectionTitle>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                onClick={undo}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                disabled={past.length === 0}
                title="Deshacer último cambio"
              >
                ↶ Deshacer
              </button>

              <button
                onClick={redo}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                disabled={future.length === 0}
                title="Rehacer"
              >
                ↷ Rehacer
              </button>

              <button
                onClick={clearCurrent}
                className="px-3 py-2 rounded-lg border bg-rose-50 text-rose-700 hover:bg-rose-500"
                title="Limpiar todos los campos de la carta actual"
              >
                🧽 Limpiar
              </button>
            </div>
              <br /> 
 
  {current && (
                <Editor
                  card={current}
                  mode={mode}
                  templates={templates}
                  onChange={(patch) => mutateCard(selected, patch)}
                  onImportSvg={onImportSvg}
                  setTemplates={setTemplates}
                />
              )}

            </div>

          </div>
        </aside>

                {/* Vista previa (centro) */}
        <section className="lg:col-span-5 order-1 lg:order-2"
          onDragOver={(e) => e.preventDefault()} onDrop={onDropPreview}>
          <div className="bg-white rounded-2xl shadow-sm border p-3">
            <SectionTitle>Vista previa</SectionTitle>
             <div
                  className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:border-emerald-400 transition-colors relative overflow-hidden"
                  style={{
                    width: '100%',
                    aspectRatio: `${svgSize.w} / ${svgSize.h}`,
                    minHeight: 360,
                    maxHeight: '85vh',
                  }}
                  title="Arrastra una imagen aquí para usarla como arte"
                >
                  {svgResponsive ? (
                    <div className="absolute inset-0">
                      {/* El <svg> interno ocupa 100% gracias a makeResponsiveSvg */}
                      <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svgResponsive }} />
                    </div>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-slate-500">
                      <div className="text-center">
                        <div className="text-4xl mb-2">🎨</div>
                        Arrastra tu imagen aquí o cárgala desde “Editar”.
                      </div>
                    </div>
                  )}
              </div>

          </div>
          
                    
            {/* Export (sin cambios de lógica) */}
            <div className="flex-wrap gap-2 mt-3" >
              <div className="bg-white rounded-2xl shadow-sm border p-3">
              <SectionTitle>Preferencias</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>DPI</FieldLabel>
                  <input type="number" className="w-full px-3 py-2 rounded-lg border" value={dpi}
                    onChange={(e) => setDpi(Math.max(72, parseInt(e.target.value) || 72))} />
                </div>
                <div>
                  <FieldLabel>Escala export</FieldLabel>
                  <input type="number" className="w-full px-3 py-2 rounded-lg border" value={scale}
                    onChange={(e) => setScale(Math.max(1, parseFloat(e.target.value) || 1))} />
                </div>
                <div>
                  <FieldLabel>Ajusta la imagen</FieldLabel>
                  <select
                    className="w-full px-3 py-2 rounded-lg border bg-white"
                    value={(current as any)?.art_fit ?? 'contain'}
                    onChange={(e) => current && mutateCard(selected, { art_fit: e.target.value as ArtFit } as any)}
                  >
                    <option value="contain">Sin Recortar</option>
                    <option value="cover">Recortar</option>
                    <option value="stretch">Estirar</option>
                  </select>
                </div>
                <div >
                  <FieldLabel>Modo</FieldLabel> 
                  <div>
                    <button type="button" onClick={() => setMode('experto')}
                      className={'px-3 py-2 rounded-lg border ' + (mode === 'experto' ? 'bg-slate-900 text-white' : 'bg-white')}
                    >Adulto</button>
                    <button type="button" onClick={() => setMode('niño')}
                      className={'px-3 py-2 rounded-lg border ' + (mode === 'niño' ? 'bg-slate-900 text-white' : 'bg-white')}
                    >Niños</button>
                  </div>
                </div>

              <button
                className={'px-3 py-2 rounded-lg text-white ' + (hasArt ? 'bg-slate-900' : 'bg-slate-400 cursor-not-allowed')}
                disabled={!hasArt}
                onClick={() => current && svg && exportCurrentCardPng(svg, dpi, current, scale, ((current as any)?.art_fit ?? 'contain') as ArtFit)}
              >Carta Digital</button>

              <button
                className={'px-3 py-2 rounded-lg text-white ' + (hasArt ? 'bg-slate-900/90' : 'bg-slate-400 cursor-not-allowed')}
                disabled={!hasArt}
                onClick={() =>
                  current && svg && exportCurrentCardPngColoring(
                    svg, dpi, current, scale, ((current as any)?.art_fit ?? 'contain') as ArtFit,
                    { high: mode === 'niño' ? 0.18 : 0.22, low: 0.12, sigma: 1.1, thicknessPx: mode === 'niño' ? 3 : 2 }
                  )
                }
              >Carta (Colorear)</button>

              <button
                className={'px-3 py-2 rounded-lg text-white ' + (cards.some((c) => c?.arte_path) ? 'bg-emerald-600' : 'bg-slate-400 cursor-not-allowed')}
                disabled={!cards.some((c) => c?.arte_path)}
                onClick={() => setShowPrintPreview(true)}
              >Imprime 3×3</button>

              <button
                className={'px-3 py-2 rounded-lg text-white ' + (cards.some((c) => c?.arte_path) ? 'bg-emerald-700' : 'bg-slate-400 cursor-not-allowed')}
                disabled={!cards.some((c) => c?.arte_path)}
                onClick={() => setShowPrintPreview(true)}
              >Imprime 3×3 (colorear)</button>

              </div>
            </div>
            </div>

        </section>
      </div>

      {/* Overlay de Guía Rápida */}
      {showGuide && <QuickGuide onClose={closeGuide} />}
      {showPrintPreview && <PrintPreview cards={cards} templates={templates} onClose={() => setShowPrintPreview(false)} dpi={dpi} scale={scale} />}

      <NewIdeas />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Editor (con chips/stepper, sin romper tus selects y nombres de campos)
// ───────────────────────────────────────────────────────────────────────────────
import ColorPalette from './ColorPalette';

function Editor({
  card, mode, templates, onChange, onImportSvg, setTemplates
}: {
  card: Card; mode: 'experto' | 'niño'; templates: TemplateOpt[]; onChange: (patch: Partial<Card>) => void; onImportSvg: (file: File) => Promise<void>; setTemplates: (templates: TemplateOpt[]) => void;
}) {
  if (!card) return null
  const set = (k: keyof Card, v: any) => onChange({ [k]: v } as any)
  const iconos = computeIconosText(card)

  const ELEMENTOS = ['Tierra', 'Agua', 'Fuego', 'Aire', 'Mente'] as const
  const RAREZAS   = ['Común', 'Rara', 'Épica', 'Legendaria', 'Mítica'] as const
  const isKid = mode === 'niño'
  const nameLen   = String((card as any).nombre || '').length
  const efectoTxt = (card as any).efecto || (card as any).texto_efecto || ''
  const efectoLen = String(efectoTxt || '').length

  const handleColorSelect = (colors: { frame: string; accent: string }) => {
    const tpl = templates.find(t => t.id === (card as any).template_id);
    if (!tpl) return;

    const newSvg = tpl.svg.replace(
      /(<style id="palette">.*?\.frame\{fill: )[^}]+(.*?\.accent\{fill: )[^}]+(.*<\/style>)/s,
      `$1${colors.frame}$2${colors.accent}$3`
    );

    const newTemplates = templates.map(t =>
      t.id === (card as any).template_id ? { ...t, svg: newSvg } : t
    );
    setTemplates(newTemplates);
  };

  return (


    <div className="grid grid-cols-1 gap-3">
      <ColorPalette onSelect={handleColorSelect} />
      {/* Nombre / Código */}

    {/* Template 
      <div>
        <FieldLabel>Template</FieldLabel>
        <select
          className="w-full px-3 py-2 rounded-lg border bg-white"
          value={(card as any).template_id || ''}
          onChange={(e) => onChange({ template_id: e.target.value } as any)}
        >
          <option value="">(por defecto)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">Ruta base: <code>src/ui/templates</code></p>
      </div>*/}

{/* Template + Arte: en Niños van lado a lado; en Adulto, apilados */}
{isKid ? (
  // ── MODO NIÑO: lado a lado, sin "Cargar SVG"
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
    <TemplateSelector
      templates={templates}
      selectedId={(card as any)?.template_id ?? ''}
      onSelect={(id) => onChange({ template_id: id } as any)}
      onImportSvg={onImportSvg}
      canUpload={false} // ← oculta el botón "Cargar SVG"
    />

    {/* Arte (al costado del selector) */}
    <div>
      <FieldLabel>Escoge la imágen</FieldLabel>
      <div className="flex gap-2">
        <input
          className="w-full px-3 py-2 rounded-lg border"
          value={card.arte_path || ''}
          onChange={(e) => onChange({ arte_path: e.target.value } as any)}
          placeholder="https://... o data:image/png;base64,..."
        />
        <label className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 cursor-pointer whitespace-nowrap">
          Subir
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || e.currentTarget.files?.[0]; if (!f) return
              const fr = new FileReader()
              fr.onload = () => onChange({ arte_path: String(fr.result) } as any)
              fr.readAsDataURL(f)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>
    </div>
  </div>
) : (
  // ── MODO ADULTO: apilados, con "Cargar SVG"
  <>
    <TemplateSelector
      templates={templates}
      selectedId={(card as any)?.template_id ?? ''}
      onSelect={(id) => onChange({ template_id: id } as any)}
      onImportSvg={onImportSvg}
      canUpload={true} // ← muestra "Cargar SVG"
    />

    {/* Arte debajo del selector */}
    <div>
      <FieldLabel>Escoge la imágen</FieldLabel>
      <div className="flex gap-2">
        <input
          className="w-full px-3 py-2 rounded-lg border"
          value={card.arte_path || ''}
          onChange={(e) => onChange({ arte_path: e.target.value } as any)}
          placeholder="https://... o data:image/png;base64,..."
        />
        <label className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 cursor-pointer whitespace-nowrap">
          Subir
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || e.currentTarget.files?.[0]; if (!f) return
              const fr = new FileReader()
              fr.onload = () => onChange({ arte_path: String(fr.result) } as any)
              fr.readAsDataURL(f)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        Subir imagen la convierte a <code>dataURL</code> (evita CORS).
      </p>
    </div>
  </>
)}


      <div className="text-xs text-slate-500">Modo actual: <b>{isKid ? 'Niños' : 'Adulto'}</b></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <input
            className="w-full px-3 py-2 rounded-lg border"
            value={card.nombre || ''}
            placeholder={isKid ? 'Ej.: Dragón Veloz' : undefined}
            onChange={(e) => set('nombre', e.target.value)}
          />
          <div className="text-[11px] text-slate-500 mt-1">{nameLen} caracteres</div>
          {isKid ? <Hint>Nombre corto y divertido ✨</Hint> : null}
        </div>
        <div>
          <FieldLabel>Código</FieldLabel>
          <input
            className={
              'w-full px-3 py-2 rounded-lg border ' + (isKid ? 'bg-slate-50 cursor-not-allowed' : '')
            }
            value={card.set_code || ''}
            onChange={(e) => set('set_code', e.target.value)}
            disabled={isKid}
            title={isKid ? 'Solo editable en modo Adulto' : undefined}
            aria-disabled={isKid}
          />
          {isKid ? <Hint>Solo editable en modo Adulto.</Hint> : null}
        </div>
      </div>

      {/* Elemento / Rareza / IconosText */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <FieldLabel>Elemento</FieldLabel>

          {/* Niños: chips | Adulto: select */}
          {isKid ? (
            <>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ELEMENTOS.map((el) => (
                  <Chip key={el} active={(card.elemento || 'Tierra') === el} onClick={() => set('elemento', el)}>
                    {el}
                  </Chip>
                ))}
              </div>
              <Hint>Elige con un toque 👆</Hint>
            </>
          ) : (
            <select
              className="w-full px-3 py-2 rounded-lg border bg-white"
              value={card.elemento || 'Tierra'}
              onChange={(e) => set('elemento', e.target.value)}
            >
              {ELEMENTOS.map((el) => <option key={el} value={el}>{el}</option>)}
            </select>
          )}
        </div>

        <div>
          <FieldLabel>Rareza</FieldLabel>

          {/* Niños: chips | Adulto: select */}
          {isKid ? (
            <div className="flex flex-wrap gap-1.5">
              {RAREZAS.map((rz) => (
                <Chip key={rz} active={(card.rareza || 'Común') === rz} onClick={() => set('rareza', rz)}>
                  {rz}
                </Chip>
              ))}
            </div>
          ) : (
            <select
              className="w-full px-3 py-2 rounded-lg border bg-white"
              value={card.rareza || 'Común'}
              onChange={(e) => set('rareza', e.target.value)}
            >
              {RAREZAS.map((rz) => <option key={rz} value={rz}>{rz}</option>)}
            </select>
          )}
        </div>

        <div>
          <FieldLabel>IconosText (auto)</FieldLabel>
          <input className="w-full px-3 py-2 rounded-lg border bg-slate-50" value={iconos} readOnly />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><FieldLabel>ATK</FieldLabel>  <Stepper value={Number(card.atk || 0)} onChange={(v) => set('atk', v)}  min={0} max={9999} /></div>
        <div><FieldLabel>DEF</FieldLabel>  <Stepper value={Number(card.def || 0)} onChange={(v) => set('def', v)}  min={0} max={9999} /></div>
        <div><FieldLabel>HP</FieldLabel>   <Stepper value={Number(card.hp || 0)}  onChange={(v) => set('hp', v)}   min={0} max={9999} /></div>
        <div><FieldLabel>Costo</FieldLabel><Stepper value={Number(card.costo || 0)} onChange={(v) => set('costo', v)} min={0} max={99} /></div>
        </div>

      {/* Poderes / Autor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><FieldLabel>Poder 1</FieldLabel><input className="w-full px-3 py-2 rounded-lg border" value={(card as any).poder1 || (card as any).poder_1 || ''} onChange={(e) => set('poder1', e.target.value)} /></div>
        <div><FieldLabel>Poder 2</FieldLabel><input className="w-full px-3 py-2 rounded-lg border" value={(card as any).poder2 || (card as any).poder_2 || ''} onChange={(e) => set('poder2', e.target.value)} /></div>
        <div><FieldLabel>Especial</FieldLabel><input className="w-full px-3 py-2 rounded-lg border" value={(card as any).especial || (card as any).poder_especial || ''} onChange={(e) => set('especial', e.target.value)} /></div>

        {/* Adulto: muestra Autor | Niños: oculta */}
        <div>
          <FieldLabel>Autor</FieldLabel>
          <input
            className={
              'w-full px-3 py-2 rounded-lg border ' + (isKid ? 'bg-slate-50 cursor-not-allowed' : '')
            }
            value={card.autor || ''}
            onChange={(e) => set('autor', e.target.value)}
            disabled={isKid}
            title={isKid ? 'Solo editable en modo Adulto' : undefined}
            aria-disabled={isKid}
          />
          {isKid ? <Hint>Solo editable en modo Adulto.</Hint> : null}
        </div>
      </div>

      {/* Efecto */}
      <div>
        <FieldLabel>Texto de efecto</FieldLabel>
        <textarea
          className="w-full px-3 py-2 rounded-lg border min-h-[88px]"
          value={efectoTxt}
          placeholder={isKid ? 'Ej.: Si atacas primero, suma +200 ATK por esta ronda.' : undefined}
          onChange={(e) => set('efecto', e.target.value)}
        />
        <div className="text-[11px] text-slate-500 mt-1">{efectoLen} caracteres (sugerido ≤ 260)</div>
        {isKid ? <Hint>Frases cortas. ¡Imagina que se lee en voz alta! 🗣️</Hint> : null}
      </div>
    </div>
  )
}
