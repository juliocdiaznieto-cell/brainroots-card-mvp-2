import Papa, { ParseResult } from 'papaparse';
import type { Card } from './types'

/**
 * Lee CSV aceptando ambos esquemas:
 *  - antiguo: ataque/defensa/poder_1/poder_especial/texto_efecto
 *  - nuevo:   atk/def/poder1/especial/efecto
 * Devuelve SIEMPRE los nombres canónicos del editor.
 */
export async function parseCsv(file: File): Promise<Card[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: ParseResult<any>) => {
        const rows = (res.data as any[]) || []
        const out: Card[] = rows.map((r) => ({
          // básicos
          nombre: r.nombre ?? '',
          elemento: r.elemento ?? '',
          rareza: r.rareza ?? '',
          set_code: r.set_code ?? '',
          autor: r.autor ?? '',
          arte_path: r.arte_path ?? '',
          template_id: r.template_id ?? '',
          art_fit: r.art_fit ?? 'contain',

          // stats (acepta ambos nombres)
          atk: Number(r.atk ?? r.ATK ?? r.ataque ?? 0),
          def: Number(r.def ?? r.DEF ?? r.defensa ?? 0),
          hp: Number(r.hp ?? r.HP ?? 0),
          costo: Number(r.costo ?? r.COSTO ?? r.cost ?? 0),

          // poderes y texto (ambos nombres)
          poder1: r.poder1 ?? r.poder_1 ?? '',
          poder2: r.poder2 ?? r.poder_2 ?? '',
          especial: r.especial ?? r.poder_especial ?? '',
          efecto: r.efecto ?? r.texto_efecto ?? '',

          // listas
          iconos: String(r.iconos ?? '').split('|').filter(Boolean),
          tags: String(r.tags ?? '').split('|').filter(Boolean),
        }) as any)
        resolve(out)
      },
      error: reject,
    })
  })
}

/**
 * Exporta SIEMPRE con el esquema canónico del editor para round-trip perfecto.
 */
export function toCsv(cards: Card[]): string {
  const rows = cards.map((c: any) => ({
    // básicos
    nombre: c.nombre ?? '',
    elemento: c.elemento ?? '',
    rareza: c.rareza ?? '',
    set_code: c.set_code ?? '',
    autor: c.autor ?? '',
    arte_path: c.arte_path ?? '',
    template_id: c.template_id ?? '',
    art_fit: c.art_fit ?? '',

    // stats
    atk: Number(c.atk ?? c.ataque ?? 0),
    def: Number(c.def ?? c.defensa ?? 0),
    hp: Number(c.hp ?? 0),
    costo: Number(c.costo ?? 0),

    // poderes y texto
    poder1: c.poder1 ?? c.poder_1 ?? '',
    poder2: c.poder2 ?? c.poder_2 ?? '',
    especial: c.especial ?? c.poder_especial ?? '',
    efecto: c.efecto ?? c.texto_efecto ?? '',

    // listas
    iconos: (c.iconos ?? []).join('|'),
    tags: (c.tags ?? []).join('|'),
  }))
  return Papa.unparse(rows)
}
