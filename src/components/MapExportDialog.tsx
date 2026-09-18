import React, { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { FLOATING_CARD, Z_MODAL_BG, Z_MODAL_TOP } from '../styles';
import { canShareMapExport, createMapExport, downloadMapExport, shareMapExport } from '../utils/mapExport';

interface Props {
  open: boolean;
  source: HTMLCanvasElement | null;
  defaultTitle: string;
  lightMode: boolean;
  onClose: () => void;
}

export default function MapExportDialog({ open, source, defaultTitle, lightMode, onClose }: Props) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    if (open) setShareSupported(canShareMapExport());
  }, [open]);

  if (!open) return null;

  const handleExport = async (mode: 'download' | 'share') => {
    if (!source || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await createMapExport({ source, title: defaultTitle, lightMode });
      if (mode === 'share') {
        await shareMapExport(blob, defaultTitle);
      } else {
        downloadMapExport(blob, defaultTitle);
      }
      onClose();
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
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
            <p className="mt-1 text-[11px] font-bold text-[var(--text-dim)]">1600 × 900 PNG with Atlas attribution.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export dialog" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-[10px] font-black uppercase tracking-wide text-[var(--text-dim)]">Title</p>
        <p className="mt-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-app)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">{defaultTitle}</p>
        {error && <p role="alert" className="mt-2 text-[11px] font-bold text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-btn-hover)]">Cancel</button>
          <button
            type="button"
            onClick={() => void handleExport('download')}
            disabled={!source || exporting}
            className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Preparing…' : 'Download PNG'}
          </button>
          {shareSupported && (
            <button
              type="button"
              onClick={() => void handleExport('share')}
              disabled={!source || exporting}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-primary)] px-3.5 py-2 text-xs font-black text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
