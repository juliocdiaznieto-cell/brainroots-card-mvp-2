// src/ui/ColorPalette.tsx
import React from 'react';

const PALETTES = [
  { name: 'Default', frame: '#0f172a', accent: '#0d3393' },
  { name: 'Amber', frame: '#4a2c0f', accent: '#b45309' },
  { name: 'Amethyst', frame: '#3b0764', accent: '#7e22ce' },
  { name: 'Azure', frame: '#0c3a5e', accent: '#0284c7' },
  { name: 'Crimson', frame: '#5f0f0f', accent: '#dc2626' },
  { name: 'Emerald', frame: '#064e3b', accent: '#059669' },
  { name: 'Lime', frame: '#365314', accent: '#84cc16' },
  { name: 'Magenta', frame: '#6d0c4b', accent: '#d946ef' },
  { name: 'Royal', frame: '#4a044e', accent: '#a855f7' },
  { name: 'Sunset', frame: '#7c2d12', accent: '#f97316' },
];

interface ColorPaletteProps {
  onSelect: (colors: { frame: string; accent: string }) => void;
}

export default function ColorPalette({ onSelect }: ColorPaletteProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">Color Palette</label>
      <div className="flex flex-wrap gap-2">
        {PALETTES.map((palette) => (
          <button
            key={palette.name}
            type="button"
            className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: palette.accent }}
            title={palette.name}
            onClick={() => onSelect({ frame: palette.frame, accent: palette.accent })}
          />
        ))}
      </div>
    </div>
  );
}
