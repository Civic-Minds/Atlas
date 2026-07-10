import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, ExternalLink, Search, Radio, ArrowLeft } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim, SEARCH_PILL, SEARCH_FIELD, Z_MODAL_BG } from '../styles';
import { LIVE_POLLING_ROUTES } from '../../shared/livePollingConfig';
import { R2_PUBLIC_URL } from '../../shared/config';
import { agencyDisplayParts, formatStoredDate } from '../utils/format';
import { feedRefreshCountdownLabel, FEED_REFRESH_CADENCE_LABEL, type FeedRefreshMeta } from '../../shared/feedRefresh';
import { agencyQualifiesForHistoryExplore } from '../../shared/historyEligibility';
import type { Agency } from '../App';

interface HistoryAgencySummary { slug: string; name: string; region: string; routes: unknown[] }

type View = 'home' | 'agencies' | 'agency-detail' | 'outdated-schedule' | 'corrected-data' | 'sources';
export type Tab = 'about' | 'agencies' | 'history' | 'live';
export type InfoFeatureFilter = 'all' | 'live' | 'history';
export type HelpTopic = 'outdated-schedule' | 'corrected-data';
export type HelpContext = {
  topic: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  lastRefreshedAt?: string;
  websiteUrl?: string;
  overrideNote?: string;
};
export type OpenInfoOptions = {
  featureFilter?: 'live' | 'history';
  helpTopic?: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  lastRefreshedAt?: string;
  websiteUrl?: string;
  overrideNote?: string;
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
  feedRefreshMeta?: FeedRefreshMeta | null;
  onAgencySelect?: (slug: string) => void;
  onLiveRouteClick?: (slug: string, routeShortName: string) => void;
}

function tabToView(tab: Tab): View {
  if (tab === 'about') return 'home';
  return 'agencies';
}

export default function InfoPanel({ open, onClose, agencies, defaultTab, featureFilter = 'all', helpContext, feedRefreshMeta, onAgencySelect, onLiveRouteClick }: Props) {
  const [view, setView] = useState<View>('home');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<Set<string>>(() => new Set());
  const [agencyFeatureFilter, setAgencyFeatureFilter] = useState<InfoFeatureFilter>('all');
  const [visible, setVisible] = useState(false);
  const [historyAgencies, setHistoryAgencies] = useState<HistoryAgencySummary[] | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Close on click outside the panel (allows background elements to receive hover/clicks)
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setView(
        helpContext?.topic === 'outdated-schedule' ? 'outdated-schedule'
        : helpContext?.topic === 'corrected-data' ? 'corrected-data'
        : tabToView(defaultTab ?? 'about'),
      );
      setAgencyFeatureFilter(featureFilter);
      setSelectedSlug(null);
    } else {
      setQuery(''); setRegionFilter(new Set()); setSelectedSlug(null); setAgencyFeatureFilter('all');
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
    for (const a of historyAgencies ?? []) {
      if (agencyQualifiesForHistoryExplore(a as any)) map.set(a.slug, a);
    }
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
    if (regionFilter.size === 0) return;
    const next = new Set([...regionFilter].filter(r => regionsInScope.includes(r)));
    if (next.size !== regionFilter.size) setRegionFilter(next);
  }, [regionFilter, regionsInScope]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return agencies.filter(a => {
      if (agencyFeatureFilter === 'live' && !liveBySlug.has(a.slug)) return false;
      if (agencyFeatureFilter === 'history' && !historyBySlug.has(a.slug)) return false;
      if (regionFilter.size > 0 && !regionFilter.has(a.region ?? 'Other')) return false;
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
    // index.json is hand-ordered (Ontario first, etc.) — browse list should be alpha
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    return new Map(
      [...map.entries()].sort(([a], [b]) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      }),
    );
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

  // Current page title (not the back destination — back is the arrow alone)
  const headerTitle =
    view === 'agencies' ? 'Agencies'
    : view === 'agency-detail' ? selectedAgency?.name ?? ''
    : view === 'outdated-schedule' ? 'Outdated schedule'
    : view === 'corrected-data' ? 'Corrected data'
    : view === 'sources' ? 'Sources'
    : null;

  return (
    <div className={`fixed inset-0 ${Z_MODAL_BG} pointer-events-none`}>
      <div
        ref={panelRef}
        className={`${DROPDOWN_PANEL} ${dropdownAnim(visible)} pointer-events-auto`}
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

          {/* Back (arrow only) + current page title */}
          <div 
            className={`absolute inset-y-0 left-5 right-12 flex items-center gap-1.5 transition-all duration-300 ease-out ${
              view !== 'home' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
            }`}
          >
            <button
              onClick={() => {
                if (view === 'agency-detail') setView('agencies');
                else setView('home');
              }}
              className="w-7 h-7 -ml-1.5 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] transition-colors shrink-0"
              aria-label={view === 'agency-detail' ? 'Back to agencies' : 'Back'}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-[var(--text-primary)] truncate min-w-0">
              {headerTitle}
            </span>
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
                  Covering {agencies.length} transit agencies. See live vehicle positions on {totalLiveAgencies}, or explore how service changed at {totalHistoryAgencies}.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => setView('agencies')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Browse agencies</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                  </button>
                  <button
                    onClick={() => setView('sources')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                  >
                    <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Schedule sources</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Feedback</p>
                <a
                  href="mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback"
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Send feedback</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                </a>
              </div>

              <p className="text-[10px] text-[var(--text-dim)] leading-relaxed">
                © 2026 Civic Minds.
              </p>
            </div>
          )}

          {view === 'agencies' && (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <div className="shrink-0 px-4 pt-3 pb-2 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] space-y-2">
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
                  ] as const).map(([id, label]) => {
                    const on = agencyFeatureFilter === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setAgencyFeatureFilter(id)}
                        aria-pressed={on}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                          on
                            ? 'bg-[var(--bg-btn-hover)] text-[var(--text-primary)] border-[var(--text-primary)]'
                            : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--text-dim)]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {regionsInScope.length > 0 && (
                    <span className="w-px h-3.5 shrink-0 bg-[var(--border-primary)] mx-0.5" aria-hidden />
                  )}
                  {regionsInScope.map(r => {
                    const on = regionFilter.has(r);
                    return (
                      <button
                        key={r}
                        onClick={() => setRegionFilter(prev => {
                          const next = new Set(prev);
                          if (next.has(r)) next.delete(r);
                          else next.add(r);
                          return next;
                        })}
                        aria-pressed={on}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                          on
                            ? 'bg-[var(--bg-btn-hover)] text-[var(--text-primary)] border-[var(--text-primary)]'
                            : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--text-dim)]'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
                          const { primary, secondary } = agencyDisplayParts(a.name);
                          const listLabel = secondary ? `${primary} · ${secondary}` : primary;
                          return (
                            <button
                              key={a.slug}
                              onClick={() => { onAgencySelect?.(a.slug); onClose(); }}
                              className="w-full flex items-center justify-between px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left"
                              title={a.name !== listLabel ? a.name : undefined}
                            >
                              <span className="text-xs text-[var(--text-primary)] min-w-0 truncate">
                                {primary}
                                {secondary && (
                                  <span className="text-[var(--text-dim)]"> · {secondary}</span>
                                )}
                              </span>
                              {(showLiveBadge || showHistoryBadge) && (
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {showLiveBadge && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-btn)] text-[var(--text-muted)] border border-[var(--border-primary)]">Live</span>
                                  )}
                                  {showHistoryBadge && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-btn)] text-[var(--text-muted)] border border-[var(--border-primary)]">History</span>
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
            </div>
          )}

          {view === 'sources' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                We use GTFS schedule feeds from transit agencies — usually downloaded directly from each agency&apos;s published URL.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                When we can&apos;t rely on the official feed, we may use a public copy from:
              </p>
              <div className="space-y-2">
                <a
                  href="https://mobilitydatabase.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Mobility Database</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                </a>
                <a
                  href="https://www.transit.land/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Transitland</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                </a>
              </div>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {feedRefreshMeta?.lastCompletedAt && formatStoredDate(feedRefreshMeta.lastCompletedAt.slice(0, 10))
                  ? `Last full refresh: ${formatStoredDate(feedRefreshMeta.lastCompletedAt.slice(0, 10))}. `
                  : ''}
                {feedRefreshCountdownLabel(feedRefreshMeta)}
              </p>
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
                {FEED_REFRESH_CADENCE_LABEL} Sometimes an agency is late publishing, or their download link breaks, and the warning can linger even though service may have changed.
              </p>
              {helpContext?.websiteUrl && (
                <a
                  href={helpContext.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Check current schedules</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                </a>
              )}
              <a
                href="mailto:hey@ryanisnota.pro?subject=Atlas%20schedule%20feedback"
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Report a problem</span>
                <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
              </a>
            </div>
          )}

          {view === 'corrected-data' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && helpContext.overrideNote && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {helpContext.overrideNote}
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                Sometimes agencies publish incorrect data in their GTFS feed. When we find a known problem, we filter it out during processing so the map reflects real service.
              </p>
              <a
                href="mailto:hey@ryanisnota.pro?subject=Atlas%20data%20feedback"
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
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-btn)] text-[var(--text-muted)] border border-[var(--border-primary)]">Live ({selectedLiveRoutes.length})</span>
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
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-btn)] text-[var(--text-muted)] border border-[var(--border-primary)]">History</span>
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
