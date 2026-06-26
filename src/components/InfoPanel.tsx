import React, { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

const TIER_LEGEND = [
  { color: '#2563eb', label: '≤10 min' },
  { color: '#16a34a', label: '11–20 min' },
  { color: '#ca8a04', label: '21–30 min' },
  { color: '#dc2626', label: '>30 min' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  agencyCount: number;
}

export default function InfoPanel({ open, onClose, agencyCount }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-[1200] bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1300] w-[360px] max-h-[80vh] overflow-y-auto bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--border-primary)]">
          <div>
            <p className="text-sm font-black text-[var(--text-primary)]">Atlas</p>
            <p className="text-[10px] text-[var(--text-dim)] mt-0.5">by Civic Minds</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* About */}
          <div>
            <p className="text-xs text-[var(--text-primary)] leading-relaxed">
              A live transit frequency map for the Greater Golden Horseshoe.
              Routes are colored by how often they run — blue is frequent, red is infrequent.
            </p>
          </div>

          {/* Coverage */}
          <div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">Coverage</p>
            <p className="text-xs text-[var(--text-primary)]">
              <span className="font-bold">{agencyCount}</span> transit agencies across the GTHA and surrounding region, refreshed weekly from official GTFS feeds.
            </p>
          </div>

          {/* Frequency legend */}
          <div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">Frequency tiers</p>
            <div className="space-y-1.5">
              {TIER_LEGEND.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="w-4 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-[var(--text-primary)]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">Links</p>
            <div className="space-y-2">
              <a
                href="https://github.com/Civic-Minds/Atlas/blob/main/public/data/index.json"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Agency list</span>
                <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
              </a>
              <a
                href="https://github.com/Civic-Minds/Atlas"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">GitHub</span>
                <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
              </a>
            </div>
          </div>

          {/* Data note */}
          <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            Schedule data is sourced from official GTFS feeds published by each agency and is updated automatically every Monday.
          </p>
        </div>
      </div>
    </>
  );
}
