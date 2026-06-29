import React, { useEffect, useState, useMemo } from 'react';
import { X, ExternalLink, Search, Radio } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim, SEARCH_PILL, SEARCH_FIELD } from '../styles';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import { R2_PUBLIC_URL } from '../../shared/config';
import type { Agency } from '../App';

interface HistoryAgencySummary { slug: string; name: string; region: string; routes: unknown[] }

type Tab = 'about' | 'agencies' | 'history' | 'live';

export function liveRouteLabel(r: { displayRouteShortName: string; displayName?: string }): string {
  if (r.displayName) return r.displayName;
  const n = parseInt(r.displayRouteShortName, 10);
  return `Route ${isNaN(n) ? r.displayRouteShortName : n}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agencies: Agency[];
  defaultTab?: Tab;
  onAgencySelect?: (slug: string) => void;
  onLiveRouteClick?: (slug: string, routeShortName: string) => void;
}

const TAB_LABELS: Record<Tab, string> = { about: 'About', agencies: 'Agencies', history: 'History', live: 'Live' };

export default function InfoPanel({ open, onClose, agencies, defaultTab, onAgencySelect, onLiveRouteClick }: Props) {
  const [tab, setTab] = useState<Tab>('about');
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [liveQuery, setLiveQuery] = useState('');
  const [visible, setVisible] = useState(false);
  const [historyAgencies, setHistoryAgencies] = useState<HistoryAgencySummary[] | null>(null);

  useEffect(() => {
    fetch(`${R2_PUBLIC_URL}/atlas/history-config.json`)
      .then(r => r.json())
      .then((d: HistoryAgencySummary[]) => setHistoryAgencies(d))
      .catch(() => setHistoryAgencies([]));
  }, []);

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
    if (open) {
      setTab(defaultTab ?? 'about');
    } else {
      setQuery(''); setRegionFilter(null); setLiveQuery('');
    }
  }, [open, defaultTab]);

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
        {/* Tabs + close */}
        <div className="shrink-0 flex items-center px-5 border-b border-[var(--border-primary)]">
          <div className="flex flex-1 gap-3">
            {(['about', 'agencies', 'history', 'live'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3.5 pt-4 text-xs font-bold border-b-2 transition-colors ${
                  tab === t
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
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
                A transit atlas covering {agencies.length} agencies across North America.
              </p>

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
                <div className={SEARCH_PILL}>
                  <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search agencies…"
                    className={SEARCH_FIELD}
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
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
                      {list.map(a => {
                        const hasLive = LIVE_POLLING_ROUTES.some(r => r.slug === a.slug && (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar || r.active));
                        return (
                          <button
                            key={a.slug}
                            onClick={() => { onAgencySelect?.(a.slug); onClose(); }}
                            className="w-full flex items-center justify-between px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left"
                          >
                            <span className="text-xs text-[var(--text-primary)]">{a.name}</span>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {hasLive && <Radio className="w-3 h-3 text-[var(--accent)]" />}
                              <span className="text-[10px] text-[var(--text-dim)] font-mono">{a.slug}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="flex flex-col">
              <div className="px-5 py-3 border-b border-[var(--border-primary)]">
                <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                  Historical frequency data is available for a subset of agencies. More are added as GTFS snapshots accumulate.
                </p>
              </div>
              {historyAgencies === null && (
                <p className="text-[11px] text-[var(--text-dim)] px-5 py-4">Loading…</p>
              )}
              {historyAgencies !== null && historyAgencies.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] px-5 py-4">No agencies yet.</p>
              )}
              {historyAgencies !== null && historyAgencies.length > 0 && (
                <div className="py-2">
                  {historyAgencies.map((a) => (
                    <div
                      key={a.slug}
                      className="flex items-center justify-between px-5 py-2"
                    >
                      <div>
                        <p className="text-xs text-[var(--text-primary)]">{a.name}</p>
                        <p className="text-[10px] text-[var(--text-dim)]">{a.region}</p>
                      </div>
                      <p className="text-[10px] text-[var(--text-dim)] tabular-nums shrink-0 ml-2">{a.routes.length} routes</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'live' && (() => {
            const lq = liveQuery.toLowerCase().trim();
            const activeRoutes = LIVE_POLLING_ROUTES.filter(r => {
              if ((r.apiKeyParamEnvVar || r.apiKeyHeaderEnvVar) && !r.active) return false;
              if (!lq) return true;
              const label = liveRouteLabel(r).toLowerCase();
              const agencyName = (agencies.find(a => a.slug === r.slug)?.name ?? r.slug).toLowerCase();
              return label.includes(lq) || agencyName.includes(lq);
            });
            const byAgency = activeRoutes.reduce<Record<string, { slug: string; name: string; routes: typeof LIVE_POLLING_ROUTES }>>((acc, r) => {
              if (!acc[r.slug]) {
                const agencyName = agencies.find(a => a.slug === r.slug)?.name ?? r.slug;
                acc[r.slug] = { slug: r.slug, name: agencyName, routes: [] };
              }
              acc[r.slug].routes.push(r);
              return acc;
            }, {});
            return (
              <div className="flex flex-col">
                <div className="sticky top-0 px-4 pt-3 pb-2 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] z-10">
                  <div className={SEARCH_PILL}>
                    <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                    <input
                      type="text"
                      value={liveQuery}
                      onChange={e => setLiveQuery(e.target.value)}
                      placeholder="Search routes…"
                      className={SEARCH_FIELD}
                    />
                    {liveQuery && (
                      <button onClick={() => setLiveQuery('')} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="py-2">
                  {Object.values(byAgency).map(({ slug, name, routes: agRoutes }) => (
                    <div key={slug}>
                      <p className="px-5 pt-3 pb-1 text-[10px] font-bold text-[var(--text-dim)]">{name}</p>
                      {agRoutes.map(r => (
                        <button
                          key={r.displayRouteShortName}
                          onClick={() => { onLiveRouteClick?.(r.slug, r.displayRouteShortName); onClose(); }}
                          className="w-full flex items-center gap-2 px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left"
                        >
                          <Radio className="w-3 h-3 text-[var(--accent)] shrink-0" />
                          <span className="text-xs text-[var(--text-primary)]">{liveRouteLabel(r)}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {Object.keys(byAgency).length === 0 && (
                    <p className="px-5 py-4 text-xs text-[var(--text-dim)]">No routes match.</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
