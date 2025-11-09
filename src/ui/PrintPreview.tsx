// src/ui/PrintPreview.tsx
import React from 'react';
import type { Card } from '../utils/types';
import { exportSheetPdfPerTemplate, exportSheetPdfColoring } from '../utils/Exporters';
import { fillTemplate } from '../utils/TemplateRenderer';
import { mapCardToTemplateVars } from './App'; // Assuming App.tsx exports this

interface PrintPreviewProps {
  cards: Card[];
  templates: { id: string; name: string; svg: string }[];
  onClose: () => void;
  dpi: number;
  scale: number;
}

export default function PrintPreview({ cards, templates, onClose, dpi, scale }: PrintPreviewProps) {
  const currentTplSvg = templates[0]?.svg || '';

  const handlePrintColor = () => {
    exportSheetPdfPerTemplate(
      cards.filter((c) => c.arte_path),
      (c) => templates.find((t) => t.id === (c as any).template_id)?.svg || currentTplSvg,
      'A4',
      dpi,
      scale,
      (c) => ((c as any).art_fit ?? 'contain'),
    );
  };

  const handlePrintColoring = () => {
    exportSheetPdfColoring(
      cards.filter((c) => c.arte_path),
      currentTplSvg,
      'A4',
      dpi,
      scale,
      (c) => ((c as any).art_fit ?? 'contain'),
      { high: 0.22, low: 0.12, sigma: 1.1, thicknessPx: 2 },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-4xl h-[90vh] rounded-2xl bg-white shadow-xl border overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Vista Previa de Impresión (3x3)</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border hover:bg-slate-50" aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-4">
            {cards.map((card, index) => {
              const tplSvg = templates.find(t => t.id === (card as any).template_id)?.svg || currentTplSvg;
              const svg = fillTemplate(tplSvg, mapCardToTemplateVars(card) as any, { artFit: (card as any).art_fit || 'contain' });
              return (
                <div key={index} className="aspect-[65/92] border rounded-lg overflow-hidden">
                  <div dangerouslySetInnerHTML={{ __html: svg }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-end gap-4">
          <button onClick={handlePrintColor} className="px-4 py-2 rounded-lg bg-emerald-600 text-white">Imprimir 3x3</button>
          <button onClick={handlePrintColoring} className="px-4 py-2 rounded-lg bg-emerald-700 text-white">Imprimir 3x3 (colorear)</button>
        </div>
      </div>
    </div>
  );
}
