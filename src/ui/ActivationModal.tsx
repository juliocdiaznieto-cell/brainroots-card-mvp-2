// src/ui/ActivationModal.tsx
import React, { useState } from 'react';

interface ActivationModalProps {
  onActivate: (key: string) => Promise<boolean>;
  onClose: () => void;
}

export default function ActivationModal({ onActivate, onClose }: ActivationModalProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const success = await onActivate(licenseKey);

    setIsLoading(false);
    if (!success) {
      setError('Invalid license key. Please check the key and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">Activate Product</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">
              Please enter your license key to unlock all features, including exporting and printing.
            </p>
            <div>
              <label htmlFor="licenseKey" className="block text-sm font-medium text-slate-700 mb-1">
                License Key
              </label>
              <input
                id="licenseKey"
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="Enter your license key..."
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t flex items-center justify-end gap-4 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:bg-slate-100"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow disabled:bg-slate-400"
              disabled={isLoading}
            >
              {isLoading ? 'Activating...' : 'Activate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
