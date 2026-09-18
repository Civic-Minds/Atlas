import React, { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { FLOATING_CARD, Z_MODAL_BG, Z_MODAL_TOP } from '../styles';
import { createMapExport, downloadMapExport } from '../utils/mapExport';

interface Props {
  open: boolean;
  source: HTMLCanvasElement | null;
  defaultTitle: string;
  lightMode: boolean;
  onClose: () => void;
}

export default function MapExportDialog({ open, source, defaultTitle, lightMode, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [defaultTitle, open]);

  if (!open) return null;

  const handleExport = async () => {
    if (!source || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await createMapExport({ source, title, lightMode });
      downloadMapExport(blob, title);
      onClose();
    } catch {
      setError('The map was not ready. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${Z_MODAL_BG} flex items-center justify-center bg-black/35 px-4`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-export-title"
        className={`${FLOATING_CARD} ${Z_MODAL_TOP} w-full max-w-md p-5`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="map-export-title" className="text-sm font-black text-[var(--text-primary)]">Export map image</h2>
            <p className="mt-1 text-[11px] font-bold text-[var(--text-dim)]">1200 × 630 PNG with Atlas attribution.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export dialog" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label htmlFor="map-export-title-input" className="mt-5 block text-[10px] font-black uppercase tracking-wide text-[var(--text-dim)]">Title</label>
        <input
          ref={inputRef}
          id="map-export-title-input"
          value={title}
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void handleExport(); }}
          maxLength={120}
          className="mt-1.5 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-app)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
        />
        {error && <p role="alert" className="mt-2 text-[11px] font-bold text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-btn-hover)]">Cancel</button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!source || exporting}
            className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Preparing…' : 'Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
