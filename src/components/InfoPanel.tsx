import React, { useEffect, useState, useMemo } from 'react';
import { X, ExternalLink, Search } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim } from '../styles';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import type { Agency } from '../App';

type Tab = 'about' | 'agencies';

interface Props {
  open: boolean;
  onClose: () => void;
  agencies: Agency[];
}

export default function InfoPanel({ open, onClose, agencies }: Props) {
  const [tab, setTab] = useState<Tab>('about');
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) { setTab('about'); setQuery(''); setRegionFilter(null); }
  }, [open]);

  const regions = useMemo(() => {
    const seen = new Set<string>();
    for (const a of agencies) seen.add(a.region ?? 'Other');
    return [...seen].sort();
  }, [agencies]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return agencies.filter(a => {
      if (regionFilter && (a.region ?? 'Other') !== regionFilter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.slug.includes(q);
    });
  }, [agencies, query, regionFilter]);

  const byRegion = useMemo(() => {
    const map = new Map<string, Agency[]>();
    for (const a of filtered) {
      const r = a.region ?? 'Other';
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(a);
    }
    return map;
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1400]" onClick={onClose}>
      <div
        className={`${DROPDOWN_PANEL} ${dropdownAnim(visible)}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--border-primary)]">
          <h2 className="text-xs font-black text-[var(--text-primary)]">About</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex px-5 gap-3 border-b border-[var(--border-primary)]">
          {(['about', 'agencies'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2.5 pt-3 text-xs font-bold capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t === 'agencies' ? 'Agencies' : t}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'about' && (
            <div className="px-5 py-4 space-y-5">
              <div>
                <p className="text-base font-black text-[var(--text-primary)]">Atlas</p>
                <p className="text-[11px] text-[var(--text-dim)] mt-0.5">by Civic Minds</p>
              </div>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                A frequency map covering 65 transit agencies across Canada and the US Great Lakes — from Halifax to Vancouver, south into Michigan and Ohio. Routes are colored by headway: blue runs every 10 minutes or better, red runs hourly or less.
              </p>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                Select routes include live schedule adherence monitoring using real-time GTFS feeds.
              </p>

              <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Live tracking</p>
                <div className="space-y-1">
                  {Object.entries(
                    LIVE_POLLING_ROUTES.reduce<Record<string, string[]>>((acc, r) => {
                      (acc[r.slug] ??= []).push(r.displayRouteShortName);
                      return acc;
                    }, {})
                  ).map(([slug, routes]) => (
                    <div key={slug} className="flex items-baseline gap-2">
                      <span className="text-[10px] font-bold text-[var(--text-primary)] shrink-0">{slug}</span>
                      <span className="text-[10px] text-[var(--text-dim)]">{routes.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Links</p>
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

              <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                Schedule data from official GTFS feeds, refreshed every Monday. © 2026 Civic Minds.
              </p>
            </div>
          )}

          {tab === 'agencies' && (
            <div className="flex flex-col">
              <div className="sticky top-0 px-4 pt-3 pb-2 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] z-10 space-y-2">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search agencies…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <button
                    onClick={() => setRegionFilter(null)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                      regionFilter === null
                        ? 'bg-[var(--accent)] text-white border-transparent'
                        : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    All
                  </button>
                  {regions.map(r => (
                    <button
                      key={r}
                      onClick={() => setRegionFilter(prev => prev === r ? null : r)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                        regionFilter === r
                          ? 'bg-[var(--accent)] text-white border-transparent'
                          : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {byRegion.size === 0 ? (
                <p className="px-5 py-6 text-xs text-[var(--text-dim)] text-center">No agencies match.</p>
              ) : (
                <div className="py-2">
                  {[...byRegion.entries()].map(([region, list]) => (
                    <div key={region}>
                      <p className="px-5 pt-3 pb-1 text-[10px] font-bold text-[var(--text-dim)]">{region}</p>
                      {list.map(a => (
                        <div key={a.slug} className="flex items-center justify-between px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors">
                          <span className="text-xs text-[var(--text-primary)]">{a.name}</span>
                          <span className="text-[10px] text-[var(--text-dim)] font-mono ml-2 shrink-0">{a.slug}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
