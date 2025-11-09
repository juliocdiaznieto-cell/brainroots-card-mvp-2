// src/ui/Header.tsx
import React from 'react';

export default function Header() {
  return (
    <header className="flex items-center justify-between p-4 bg-white shadow-md">
      <div className="flex items-center">
        {/* You can replace this with your actual logo */}
        <svg
          className="w-8 h-8 mr-2 text-emerald-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v11.494m-9-5.747h18"
          />
        </svg>
        <h1 className="text-xl font-bold text-slate-800">Card Craft</h1>
      </div>
      <div className="text-sm text-slate-500">Beta 1.0</div>
    </header>
  );
}
