// src/utils/templates.ts
export type TemplateInfo = { id: string; name: string; svg: string }

// Saca <title>…</title> del SVG si existe
export function parseSvgTitle(svg: string): string | null {
  const m = svg.match(/<title>([\s\S]*?)<\/title>/i)
  return m?.[1]?.trim() || null
}

// Crea un id legible a partir del nombre
export function slugify(s: string) {
  return s.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}
