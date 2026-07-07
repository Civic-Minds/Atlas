import React, { useEffect, useState, useMemo } from 'react';
import { X, ExternalLink, Search, Radio, ArrowLeft } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim, SEARCH_PILL, SEARCH_FIELD, Z_MODAL_BG } from '../styles';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import { R2_PUBLIC_URL } from '../../shared/config';
import { formatStoredDate } from '../utils/format';
import type { Agency } from '../App';

interface HistoryAgencySummary { slug: string; name: string; region: string; routes: unknown[] }

type View = 'home' | 'agencies' | 'agency-detail' | 'outdated-schedule';
export type Tab = 'about' | 'agencies' | 'history' | 'live';
export type InfoFeatureFilter = 'all' | 'live' | 'history';
export type HelpTopic = 'outdated-schedule';
export type HelpContext = {
  topic: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  lastRefreshedAt?: string;
};
export type OpenInfoOptions = {
  featureFilter?: 'live' | 'history';
  helpTopic?: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  lastRefreshedAt?: string;
};
export type OpenInfoFn = (tab?: Tab, opts?: OpenInfoOptions) => void;

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
  featureFilter?: InfoFeatureFilter;
  helpContext?: HelpContext | null;
  onAgencySelect?: (slug: string) => void;
  onLiveRouteClick?: (slug: string, routeShortName: string) => void;
}

function tabToView(tab: Tab): View {
  if (tab === 'about') return 'home';
  return 'agencies';
}

export default function InfoPanel({ open, onClose, agencies, defaultTab, featureFilter = 'all', helpContext, onAgencySelect, onLiveRouteClick }: Props) {
  const [view, setView] = useState<View>('home');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [agencyFeatureFilter, setAgencyFeatureFilter] = useState<InfoFeatureFilter>('all');
  const [visible, setVisible] = useState(false);
  const [historyAgencies, setHistoryAgencies] = useState<HistoryAgencySummary[] | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

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
      setView(helpContext?.topic === 'outdated-schedule' ? 'outdated-schedule' : tabToView(defaultTab ?? 'about'));
      setAgencyFeatureFilter(featureFilter);
      setSelectedSlug(null);
    } else {
      setQuery(''); setRegionFilter(null); setSelectedSlug(null); setAgencyFeatureFilter('all');
    }
  }, [open, defaultTab, featureFilter, helpContext]);

  useEffect(() => {
    if (view === 'agencies') {
      const id = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [view]);

  const liveBySlug = useMemo(() => {
    const map = new Map<string, typeof LIVE_POLLING_ROUTES>();
    for (const r of LIVE_POLLING_ROUTES) {
      if ((r.apiKeyParamEnvVar || r.apiKeyHeaderEnvVar) && !r.active) continue;
      if (!map.has(r.slug)) map.set(r.slug, []);
      map.get(r.slug)!.push(r);
    }
    return map;
  }, []);

  const historyBySlug = useMemo(() => {
    const map = new Map<string, HistoryAgencySummary>();
    for (const a of historyAgencies ?? []) map.set(a.slug, a);
    return map;
  }, [historyAgencies]);

  const regionsInScope = useMemo(() => {
    const seen = new Set<string>();
    for (const a of agencies) {
      if (agencyFeatureFilter === 'live' && !liveBySlug.has(a.slug)) continue;
      if (agencyFeatureFilter === 'history' && !historyBySlug.has(a.slug)) continue;
      seen.add(a.region ?? 'Other');
    }
    return [...seen].sort();
  }, [agencies, agencyFeatureFilter, liveBySlug, historyBySlug]);

  useEffect(() => {
    if (regionFilter && !regionsInScope.includes(regionFilter)) {
      setRegionFilter(null);
    }
  }, [regionFilter, regionsInScope]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return agencies.filter(a => {
      if (agencyFeatureFilter === 'live' && !liveBySlug.has(a.slug)) return false;
      if (agencyFeatureFilter === 'history' && !historyBySlug.has(a.slug)) return false;
      if (regionFilter && (a.region ?? 'Other') !== regionFilter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.slug.includes(q);
    });
  }, [agencies, query, regionFilter, agencyFeatureFilter, liveBySlug, historyBySlug]);

  const byRegion = useMemo(() => {
    const map = new Map<string, Agency[]>();
    for (const a of filtered) {
      const r = a.region ?? 'Other';
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(a);
    }
    return map;
  }, [filtered]);

  const totalLiveAgencies = liveBySlug.size;
  const totalHistoryAgencies = historyBySlug.size;

  const selectedAgency = selectedSlug ? agencies.find(a => a.slug === selectedSlug) : null;
  const selectedLiveRoutes = selectedSlug ? (liveBySlug.get(selectedSlug) ?? []) : [];
  const selectedHistory = selectedSlug ? historyBySlug.get(selectedSlug) : null;

  const historyYearsText = useMemo(() => {
    if (!selectedHistory?.routes) return '';
    const yearsSet = new Set<number>();
    for (const r of selectedHistory.routes as any[]) {
      for (const s of r.snapshots ?? []) {
        if (s.year) yearsSet.add(s.year);
      }
    }
    const years = [...yearsSet].sort((a, b) => a - b);
    if (years.length === 0) return '';
    if (years.length === 1) return `in ${years[0]}`;
    return `from ${years[0]} to ${years[years.length - 1]}`;
  }, [selectedHistory]);

  if (!open) return null;

  const headerTitle =
    view === 'agencies' ? 'Data'
    : view === 'agency-detail' ? selectedAgency?.name ?? ''
    : view === 'outdated-schedule' ? 'Outdated schedule'
    : null;

  return (
    <div className={`fixed inset-0 ${Z_MODAL_BG}`} onClick={onClose}>
      <div
        className={`${DROPDOWN_PANEL} ${dropdownAnim(visible)}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center px-5 border-b border-[var(--border-primary)] h-12 relative overflow-hidden">
          {/* Home title */}
          <div 
            className={`absolute inset-y-0 left-5 right-12 flex items-center transition-all duration-300 ease-out ${
              view === 'home' ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
            }`}
          >
            <p className="text-sm font-black text-[var(--text-primary)]">
              Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span>
            </p>
          </div>

          {/* Back button and dynamic title */}
          <div 
            className={`absolute inset-y-0 left-5 right-12 flex items-center transition-all duration-300 ease-out ${
              view !== 'home' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
            }`}
          >
            <button
              onClick={() => {
                if (view === 'agency-detail') setView('agencies');
                else setView('home');
              }}
              className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-left"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-bold truncate max-w-[240px]">{headerTitle}</span>
            </button>
          </div>

          <div className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors shrink-0 z-10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content View Container */}
        <div className="flex-1 overflow-hidden relative">
          {view === 'home' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-5">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                A transit atlas covering agencies across North America.
              </p>

              <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Data</p>
                <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-3">
                  Covering {agencies.length} transit agencies. See live vehicle positions on {totalLiveAgencies}, or explore years of frequency history on {totalHistoryAgencies}.
                </p>
                <button
                  onClick={() => setView('agencies')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Browse agencies</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                </button>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Links</p>
                <div className="space-y-2">
                  <a
                    href="https://github.com/Civic-Minds/Atlas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">GitHub</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                  </a>
                  <a
                    href="mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback"
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Send feedback</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                  </a>
                </div>
              </div>

              <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                Schedule data from official GTFS feeds, refreshed every Monday. © 2026 Civic Minds.
              </p>
            </div>
          )}

          {view === 'agencies' && (
            <div className="flex flex-col h-full overflow-y-auto">
              <div className="sticky top-0 px-4 pt-3 pb-2 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] z-10 space-y-2">
                <div className={SEARCH_PILL}>
                  <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                  <input
                    ref={searchInputRef}
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
                <div className="flex gap-1.5 overflow-x-auto items-center [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  {([
                    ['all', 'All'],
                    ['live', 'Live'],
                    ['history', 'History'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setAgencyFeatureFilter(id)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                        agencyFeatureFilter === id
                          ? 'bg-[var(--accent)] text-white border-transparent'
                          : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {regionsInScope.length > 0 && (
                    <span className="w-px h-3.5 shrink-0 bg-[var(--border-primary)] mx-0.5" aria-hidden />
                  )}
                  {regionsInScope.map(r => (
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
                        const hasLive = liveBySlug.has(a.slug);
                        const hasHistory = historyBySlug.has(a.slug);
                        const showLiveBadge = hasLive && agencyFeatureFilter !== 'live';
                        const showHistoryBadge = hasHistory && agencyFeatureFilter !== 'history';
                        return (
                          <button
                            key={a.slug}
                            onClick={() => { onAgencySelect?.(a.slug); onClose(); }}
                            className="w-full flex items-center justify-between px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left"
                          >
                            <span className="text-xs text-[var(--text-primary)]">{a.name}</span>
                            {(showLiveBadge || showHistoryBadge) && (
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {showLiveBadge && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">Live</span>
                                )}
                                {showHistoryBadge && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">History</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'outdated-schedule' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {helpContext.agencyName}&apos;s schedule
                  {helpContext.expDateStr ? ` ended ${helpContext.expDateStr}` : ' may no longer be current'}.
                  {helpContext.lastRefreshedAt && formatStoredDate(helpContext.lastRefreshedAt)
                    ? ` Atlas last checked this feed on ${formatStoredDate(helpContext.lastRefreshedAt)}.`
                    : ''}
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                Transit agencies publish schedules in periods. When a period ends and they haven&apos;t published the next one yet, Atlas still shows the last version we have — with this warning.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                We check for updates every Monday. Sometimes an agency is late publishing, or their download link breaks, and the warning can linger even though service may have changed.
              </p>
              <a
                href="mailto:hey@ryanisnota.pro?subject=Atlas%20schedule%20feedback"
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Report a problem</span>
                <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
              </a>
            </div>
          )}

          {view === 'agency-detail' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {selectedAgency && (
                <>
                  <button
                    onClick={() => { onAgencySelect?.(selectedAgency.slug); onClose(); }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">View on map</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                  </button>

                  {selectedLiveRoutes.length > 0 && (
                    <div>
                      <div className="mb-2">
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">Live ({selectedLiveRoutes.length})</span>
                      </div>
                      <div className="space-y-1">
                        {selectedLiveRoutes.map(r => (
                          <button
                            key={r.displayRouteShortName}
                            onClick={() => { onLiveRouteClick?.(r.slug, r.displayRouteShortName); onClose(); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-[var(--bg-btn-hover)] transition-colors text-left"
                          >
                            <Radio className="w-3 h-3 text-[var(--accent)] shrink-0" />
                            <span className="text-xs text-[var(--text-primary)]">{liveRouteLabel(r)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedHistory && (
                    <div>
                      <div className="mb-2">
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">History</span>
                      </div>
                      <p className="text-xs text-[var(--text-dim)]">
                        Historical frequency data available for {selectedHistory.routes.length} routes {historyYearsText}.
                      </p>
                    </div>
                  )}

                  {selectedLiveRoutes.length === 0 && !selectedHistory && (
                    <p className="text-xs text-[var(--text-dim)]">No live or history data available for this agency yet.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
