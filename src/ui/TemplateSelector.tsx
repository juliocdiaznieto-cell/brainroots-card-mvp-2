// src/ui/TemplateSelector.tsx
import React, { useMemo } from 'react'
import { fillTemplate } from '../utils/TemplateRenderer'
import type { Card } from '../utils/types'
import type { TemplateInfo  } from '../utils/Templates'

type Props = {
  templates: TemplateInfo[]
  selectedId: string
  onSelect: (id: string) => void
  onImportSvg: (file: File) => void
  canUpload?: boolean;  
}

export default function TemplateSelector({
  templates, selectedId, onSelect, onImportSvg, canUpload = true
}: Props){
  const selected = templates.find(t => t.id === selectedId)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm text-slate-600">Plantilla</span><br/>
        <select
          className="border rounded p-2 min-w-[220px]"
          value={selectedId}
          onChange={(e)=>onSelect(e.target.value)}
        >
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

{canUpload &&(
      <label className="block" >
        <span className="text-sm text-slate-600">Cargar SVG</span><br/>
        <input  type="file" accept=".svg,image/svg+xml"  onChange={e=>{
          const f = e.target.files?.[0]; if (f) onImportSvg(f);
        }} />
      </label>
       )}
    </div>
  )
}
