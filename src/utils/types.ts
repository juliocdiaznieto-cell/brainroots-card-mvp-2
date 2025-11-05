// src/utils/types.ts

export type Card = {
  nombre: string
  tipo?: string
  rareza?: string
  elemento?: string

  // esquema antiguo:
  poder_1?: string
  poder_2?: string
  poder_especial?: string
  texto_efecto?: string
  ataque?: number
  defensa?: number

  // esquema canónico del editor:
  poder1?: string
  poder2?: string
  especial?: string
  efecto?: string
  atk?: number
  def?: number
  hp?: number
  costo?: number

  arte_path?: string
  iconos?: string[]
  set_code?: string
  autor?: string
  tags?: string[]
  art_fit?: 'contain' | 'cover' | 'stretch'
  template_id?: string
}
