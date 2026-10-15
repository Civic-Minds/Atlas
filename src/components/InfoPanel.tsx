import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Search, Radio, ArrowLeft } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim, SEARCH_PILL, SEARCH_FIELD, Z_MODAL_BG, AGENCY_LIST_PRIMARY } from '../styles';
import Pill from './ui/Pill';
import LinkCard from './ui/LinkCard';
import Tag from './ui/Tag';
import { LIVE_POLLING_ROUTES, liveCoverageForRouteNames, type LiveCoverage } from '../../shared/livePollingConfig';
import { R2_PUBLIC_URL, FEATURES } from '../../shared/config';
import { agencyDisplayParts, formatStoredDate } from '../utils/format';
import { feedRefreshCountdownLabel, type FeedRefreshMeta } from '../../shared/feedRefresh';
import { agencyQualifiesForHistory, agencyQualifiesForHistoryExplore } from '../../shared/historyEligibility';
import { countriesForAgencies } from '../../shared/regionCountry';
import { joinList } from '../../shared/overflowText';
import type { Agency } from '../App';
import { isFeedExpired } from '../utils/feedFreshness';
import { effectiveFeedExpiry } from '../../shared/feedAvailability';
import { trackEvent } from '../lib/analytics';
import { OutboundLink } from './OutboundLink';
import { EXPIRED_FEED_CADENCE, EXPIRED_FEED_CONTEXT, EXPIRED_FEED_EXPLANATION, MANUAL_FEED_CONTEXT, NO_ROUTE_SHAPE_DETAIL, NO_ROUTE_SHAPE_EXPLANATION, expiredFeedCheckHistory, expiredFeedNotice } from '../content/noticeCopy';
import RegionFilterPills from './RegionFilterPills';
import ListRow from './ui/ListRow';

interface HistoryAgencySummary { slug: string; name: string; region: string; routes: unknown[] }

type View = 'home' | 'agencies' | 'agency-detail' | 'outdated-schedule' | 'new-schedule-data' | 'corrected-data' | 'beta-rollout' | 'route-data-quality' | 'no-route-shape' | 'edge-gap-allowance' | 'weekday-variation' | 'sources';
export type Tab = 'about' | 'agencies' | 'history' | 'live';
export type InfoFeatureFilter = 'all' | 'live' | 'history';
type AgencyListFilter = InfoFeatureFilter | 'outdated';
export type HelpTopic = 'outdated-schedule' | 'new-schedule-data' | 'corrected-data' | 'beta-rollout' | 'route-data-quality' | 'no-route-shape' | 'edge-gap-allowance' | 'weekday-variation';
export type HelpContext = {
  topic: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  manualFeedSource?: boolean;
  lastRefreshedAt?: string;
  lastFeedCheckAt?: string;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string;
  websiteUrl?: string;
  overrideNote?: string;
  issueUrl?: string;
  issueUrls?: string[];
  rolloutNotice?: string;
  rolloutIssueUrl?: string;
};
export type OpenInfoOptions = {
  featureFilter?: 'live' | 'history';
  helpTopic?: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  manualFeedSource?: boolean;
  lastRefreshedAt?: string;
  lastFeedCheckAt?: string;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string;
  websiteUrl?: string;
  overrideNote?: string;
  issueUrl?: string;
  issueUrls?: string[];
  rolloutNotice?: string;
  rolloutIssueUrl?: string;
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
  layers?: Record<string, GeoJSON.FeatureCollection>;
}

function tabToView(tab: Tab): View {
  if (tab === 'about') return 'home';
  return 'agencies';
}

export default function InfoPanel({ open, onClose, agencies, defaultTab, featureFilter = 'all', helpContext, feedRefreshMeta, onAgencySelect, onLiveRouteClick, layers }: Props) {
  const [view, setView] = useState<View>('home');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<Set<string>>(() => new Set());
  const [agencyFeatureFilters, setAgencyFeatureFilters] = useState<Set<AgencyListFilter>>(() => new Set());
  const [visible, setVisible] = useState(false);
  const [historyAgencies, setHistoryAgencies] = useState<HistoryAgencySummary[] | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const countries = useMemo(() => countriesForAgencies(agencies), [agencies]);
  const countriesLabel = useMemo(() => {
    if (countries.length === 0) return 'North America';
    // Keeps its comma before the final "and" so this label reads as it always has.
    return joinList(countries, { oxford: true });
  }, [countries]);

  useEffect(() => {
    if (!FEATURES.history || historyAgencies || !open) return;
    fetch(`${R2_PUBLIC_URL}/atlas/history-config.json`)
      .then(r => r.json())
      .then((d: HistoryAgencySummary[]) => setHistoryAgencies(d))
      .catch(() => setHistoryAgencies([]));
  }, [historyAgencies, open]);

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
        : helpContext?.topic === 'new-schedule-data' ? 'new-schedule-data'
        : helpContext?.topic === 'corrected-data' ? 'corrected-data'
        : helpContext?.topic === 'beta-rollout' ? 'beta-rollout'
        : helpContext?.topic === 'route-data-quality' ? 'route-data-quality'
        : helpContext?.topic === 'no-route-shape' ? 'no-route-shape'
        : helpContext?.topic === 'edge-gap-allowance' ? 'edge-gap-allowance'
        : helpContext?.topic === 'weekday-variation' ? 'weekday-variation'
        : tabToView(defaultTab ?? 'about'),
      );
      setAgencyFeatureFilters(featureFilter === 'all' ? new Set() : new Set([featureFilter]));
      setSelectedSlug(null);
    } else {
      setQuery(''); setRegionFilter(new Set()); setSelectedSlug(null); setAgencyFeatureFilters(new Set());
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

  const liveCoverageBySlug = useMemo(() => {
    const map = new Map<string, LiveCoverage>();
    for (const [slug, layer] of Object.entries(layers ?? {})) {
      const routeNames = new Set<string>();
      for (const feature of layer.features) {
        const properties = feature.properties as { routeId?: string; routeShortName?: string | null } | null;
        if (properties?.routeId && properties.routeShortName) routeNames.add(properties.routeShortName);
      }
      const coverage = liveCoverageForRouteNames(slug, routeNames);
      if (coverage) map.set(slug, coverage);
    }
    return map;
  }, [layers]);

  const historyBySlug = useMemo(() => {
    const map = new Map<string, HistoryAgencySummary>();
    for (const a of historyAgencies ?? []) {
      if (agencyQualifiesForHistory(a as any)) map.set(a.slug, a);
    }
    return map;
  }, [historyAgencies]);

  const totalHistoryExploreAgencies = useMemo(
    () => (historyAgencies ?? []).filter(a => agencyQualifiesForHistoryExplore(a as any)).length,
    [historyAgencies],
  );

  const regionsInScope = useMemo(() => {
    const seen = new Set<string>();
    for (const a of agencies) {
      if (agencyFeatureFilters.size > 0 && ![...agencyFeatureFilters].some(filter =>
        (filter === 'live' && liveBySlug.has(a.slug))
        || (filter === 'history' && historyBySlug.has(a.slug))
        || (filter === 'outdated' && isFeedExpired(effectiveFeedExpiry(a)))
      )) continue;
      seen.add(a.region ?? 'Other');
    }
    return [...seen].sort();
  }, [agencies, agencyFeatureFilters, liveBySlug, historyBySlug]);

  useEffect(() => {
    if (regionFilter.size === 0) return;
    const next = new Set([...regionFilter].filter(r => regionsInScope.includes(r)));
    if (next.size !== regionFilter.size) setRegionFilter(next);
  }, [regionFilter, regionsInScope]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return agencies.filter(a => {
      if (agencyFeatureFilters.size > 0 && ![...agencyFeatureFilters].some(filter =>
        (filter === 'live' && liveBySlug.has(a.slug))
        || (filter === 'history' && historyBySlug.has(a.slug))
        || (filter === 'outdated' && isFeedExpired(effectiveFeedExpiry(a)))
      )) return false;
      if (regionFilter.size > 0 && !regionFilter.has(a.region ?? 'Other')) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q)
        || a.slug.includes(q)
        || (a.cities ?? []).some(city => city.toLowerCase().includes(q));
    });
  }, [agencies, query, regionFilter, agencyFeatureFilters, liveBySlug, historyBySlug]);

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
  const agencyFilterOptions: Array<[AgencyListFilter, string]> = [
    ['all', 'All'],
    ['live', 'Live'],
    ['history', 'History'],
    ...(FEATURES.outdatedFilter ? [['outdated', 'Outdated'] as [AgencyListFilter, string]] : []),
  ];

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
    : view === 'new-schedule-data' ? 'New schedule data'
    : view === 'corrected-data' ? 'Corrected data'
    : view === 'beta-rollout' ? 'Beta testing'
    : view === 'route-data-quality' ? 'Route data quality'
    : view === 'no-route-shape' ? 'Route map unavailable'
    : view === 'edge-gap-allowance' ? 'Frequency allowance'
    : view === 'weekday-variation' ? 'Weekday variation'
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
                A transit atlas covering agencies across {countriesLabel}.
              </p>

              <div>
                <p className="text-xs font-bold text-[var(--text-muted)] mb-2">Data</p>
                <p className="text-xs text-[var(--text-dim)] leading-relaxed mb-3">
                  Covering {agencies.length} transit agencies.
                  {FEATURES.live && FEATURES.history && ` See live vehicle positions on ${totalLiveAgencies}, or check History on ${totalHistoryExploreAgencies}+ agencies.`}
                  {FEATURES.live && !FEATURES.history && ` See live vehicle positions on ${totalLiveAgencies}.`}
                  {!FEATURES.live && FEATURES.history && ` Check History on ${totalHistoryExploreAgencies}+ agencies.`}
                </p>
                <div className="space-y-2">
                  <LinkCard as="button"
                    onClick={() => setView('agencies')} icon="chevron">Browse agencies</LinkCard>
                  <LinkCard as="button"
                    onClick={() => setView('sources')} icon="chevron">Schedule sources</LinkCard>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-[var(--text-muted)] mb-2">Feedback</p>
                <LinkCard href="mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback"
                  onClick={() => { trackEvent('contact_opened'); trackEvent('feedback_opened', { source: 'info_panel' }); }} icon="mail">Contact us</LinkCard>
              </div>

              <div>
                <p className="text-xs font-bold text-[var(--text-muted)] mb-2">Privacy</p>
                <LinkCard as="button" onClick={() => window.dispatchEvent(new Event('atlas:privacy-settings'))}>Privacy &amp; analytics</LinkCard>
              </div>

              <div className="text-xs text-[var(--text-dim)] space-y-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <a href="/about/docs" className="hover:text-[var(--accent)] hover:underline">Documentation</a>
                  <span aria-hidden="true">·</span>
                  <a href="/terms" className="hover:text-[var(--accent)] hover:underline">Terms</a>
                  <span aria-hidden="true">·</span>
                  <a href="/privacy" className="hover:text-[var(--accent)] hover:underline">Privacy Policy</a>
                </div>
                <p>© 2026 Civic Minds.</p>
              </div>
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
                  {agencyFilterOptions.map(([id, label]) => {
                    const on = id === 'all' ? agencyFeatureFilters.size === 0 : agencyFeatureFilters.has(id);
                    return (
                      <Pill
                        key={id}
                        tone="glass"
                        onClick={() => setAgencyFeatureFilters(current => {
                          if (id === 'all') return new Set();
                          const next = new Set(current);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })}
                        selected={on}
                        title={id === 'all' ? 'Clear status filters' : 'Combine with other filters'}
                        className="shrink-0"
                      >
                        {label}
                      </Pill>
                    );
                  })}
                  {regionsInScope.length > 0 && (
                    <span className="w-px h-3.5 shrink-0 bg-[var(--border-primary)] mx-0.5" aria-hidden />
                  )}
                  <RegionFilterPills
                    regions={regionsInScope}
                    selectedRegions={regionFilter}
                    setSelectedRegions={setRegionFilter}
                    includeAll={false}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {byRegion.size === 0 ? (
                  <p className="px-5 py-6 text-xs text-[var(--text-dim)] text-center">No agencies match.</p>
                ) : (
                  <div className="py-2">
                    {[...byRegion.entries()].map(([region, list]) => (
                      <div key={region}>
                        <p className="px-5 pt-3 pb-1 text-xs font-bold text-[var(--text-dim)]">{region}</p>
                        {list.map(a => {
                          const hasLive = liveBySlug.has(a.slug);
                          const hasHistory = historyBySlug.has(a.slug);
                          // The active status filter already explains why these rows are present.
                          // Repeating that same status on every row makes the filter feel inactive.
                          const showLiveBadge = FEATURES.live && hasLive && !agencyFeatureFilters.has('live');
                          const showHistoryBadge = FEATURES.history && hasHistory && !agencyFeatureFilters.has('history');
                          const { primary, secondary } = agencyDisplayParts(a.name, a.cities, a.displayArea);
                          const listLabel = secondary ? `${primary} · ${secondary}` : primary;
                          return (
                            <ListRow
                              key={a.slug}
                              variant="agency"
                              onClick={() => { onAgencySelect?.(a.slug); onClose(); }}
                            >
                              <span className={AGENCY_LIST_PRIMARY} title={listLabel}>
                                {primary}
                                {secondary && (
                                  <span className="text-[var(--text-dim)]"> · {secondary}</span>
                                )}
                              </span>
                              {(showLiveBadge || showHistoryBadge) && (
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {showLiveBadge && (
                                    <Tag title={liveCoverageBySlug.has(a.slug) ? undefined : 'Live route coverage is still loading.'}>
                                      {liveCoverageBySlug.get(a.slug) === 'full' ? 'Full live' : liveCoverageBySlug.get(a.slug) === 'partial' ? 'Partial live' : 'Live routes'}
                                    </Tag>
                                  )}
                                  {showHistoryBadge && (
                                    <Tag>History</Tag>
                                  )}
                                </div>
                              )}
                            </ListRow>
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
                <LinkCard href="https://mobilitydatabase.org/"
                  target="_blank"
                  rel="noopener noreferrer" icon="external">Mobility Database</LinkCard>
                <LinkCard href="https://www.transit.land/"
                  target="_blank"
                  rel="noopener noreferrer" icon="external">Transitland</LinkCard>
              </div>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {feedRefreshMeta?.lastCompletedAt && formatStoredDate(feedRefreshMeta.lastCompletedAt.slice(0, 10))
                  ? `Last full refresh: ${formatStoredDate(feedRefreshMeta.lastCompletedAt.slice(0, 10))}. `
                  : ''}
                {feedRefreshMeta?.lastScopedAt && formatStoredDate(feedRefreshMeta.lastScopedAt.slice(0, 10))
                  ? `Last targeted refresh: ${formatStoredDate(feedRefreshMeta.lastScopedAt.slice(0, 10))}. `
                  : ''}
                {feedRefreshCountdownLabel(feedRefreshMeta)}
              </p>
            </div>
          )}

          {view === 'outdated-schedule' && (() => {
            const checkHistory = expiredFeedCheckHistory({
              count: helpContext?.expiredFeedCheckCount,
              since: helpContext?.expiredFeedCheckSince,
              lastChecked: helpContext?.lastFeedCheckAt,
              lastRefreshed: helpContext?.lastRefreshedAt,
            });
            return (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {expiredFeedNotice(helpContext.agencyName, helpContext.expDateStr, helpContext.manualFeedSource)}
                </p>
              )}
              {helpContext?.agencyName && checkHistory && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">{checkHistory}</p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {EXPIRED_FEED_EXPLANATION}
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {EXPIRED_FEED_CADENCE} {helpContext?.manualFeedSource ? MANUAL_FEED_CONTEXT : EXPIRED_FEED_CONTEXT}
              </p>
              {helpContext?.websiteUrl && (
                <LinkCard as={OutboundLink}
                  href={helpContext.websiteUrl}
                  kind="agency_website" icon="external">Check current schedules</LinkCard>
              )}
              <LinkCard href="mailto:hey@ryanisnota.pro?subject=Atlas%20schedule%20feedback"
                onClick={() => trackEvent('feedback_opened', { source: 'info_panel_schedule' })} icon="mail">Report a problem</LinkCard>
            </div>
            );
          })()}

          {view === 'edge-gap-allowance' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                Atlas added a small allowance for the first or last trip of the day.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                This means a route can still qualify for its frequency tier when the first or last gap is a little longer than the rest of the service. It does not apply to gaps in the middle of the day.
              </p>
            </div>
          )}

          {view === 'weekday-variation' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                Weekday schedules differ for this route.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                Atlas checks Monday through Friday separately. The frequency tier shown on the route card reflects the slowest actual weekday, while the displayed cadence uses a typical actual weekday. This keeps the summary from combining departures that ran on different days.
              </p>
            </div>
          )}

          {view === 'new-schedule-data' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {helpContext.agencyName} recently published new schedule data.
                  {helpContext.lastRefreshedAt && formatStoredDate(helpContext.lastRefreshedAt)
                    ? ` Atlas published it on ${formatStoredDate(helpContext.lastRefreshedAt)}.`
                    : ''}
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                Atlas publishes new feeds automatically so the map stays current. We&apos;re checking this feed for missing service and data-quality problems before treating it as verified.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                This notice is temporary. It will disappear after review, or become a correction notice if we find a known problem.
              </p>
              {helpContext?.websiteUrl && (
                <LinkCard as={OutboundLink} href={helpContext.websiteUrl} kind="agency_website" icon="external">Check current schedules</LinkCard>
              )}
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
              {(helpContext?.issueUrls?.length || helpContext?.issueUrl) ? (
                <>
                  {[...(helpContext.issueUrls ?? []), ...(helpContext.issueUrls?.length ? [] : [helpContext.issueUrl])]
                    .filter((url): url is string => !!url)
                    .map((url, index) => {
                      const issueNumber = url.match(/\/issues\/(\d+)/)?.[1];
                      return (
                        <LinkCard key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer" icon="external">
                            {issueNumber ? `Technical details (#${issueNumber})` : `Technical details ${index + 1}`}
                          </LinkCard>
                      );
                    })}
                </>
              ) : null}
              <LinkCard href="mailto:hey@ryanisnota.pro?subject=Atlas%20data%20feedback"
                onClick={() => trackEvent('feedback_opened', { source: 'info_panel_data' })} icon="mail">Report a problem</LinkCard>
            </div>
          )}

          {view === 'beta-rollout' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {helpContext.agencyName} is currently available in Atlas beta while its schedule data is being validated.
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                This coverage is still being checked before it is added to the main Atlas map. Some routes or schedule details may change during testing.
              </p>
              {helpContext?.rolloutIssueUrl && (
                <LinkCard href={helpContext.rolloutIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer" icon="external">
                    {helpContext.rolloutIssueUrl.match(/\/issues\/(\d+)/)?.[1]
                      ? `Follow rollout (#${helpContext.rolloutIssueUrl.match(/\/issues\/(\d+)/)?.[1]})`
                      : 'Follow rollout'}
                  </LinkCard>
              )}
            </div>
          )}

          {view === 'route-data-quality' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {helpContext?.agencyName && (
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {helpContext.agencyName} has a problem with this route's shape in the source feed.
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                Transit agencies publish the route shapes Atlas uses to draw routes. Atlas identified a specific problem in this route&apos;s source geometry, so the route stays visible with a warning instead of hiding the entire agency.
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                The line may be incomplete or adjusted. The schedule information is separate from the map geometry.
              </p>
            </div>
          )}

          {view === 'no-route-shape' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {NO_ROUTE_SHAPE_EXPLANATION}
              </p>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed">
                {NO_ROUTE_SHAPE_DETAIL}
              </p>
            </div>
          )}

          {view === 'agency-detail' && (
            <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
              {selectedAgency && (
                <>
                  <LinkCard as="button"
                    onClick={() => { onAgencySelect?.(selectedAgency.slug); onClose(); }} icon="chevron">View on map</LinkCard>

                  {selectedLiveRoutes.length > 0 && (
                    <div>
                      <div className="mb-2">
                        <Tag className="inline-block">Live ({selectedLiveRoutes.length})</Tag>
                      </div>
                      <div className="space-y-1">
                        {selectedLiveRoutes.map(r => (
                          <ListRow
                            key={r.displayRouteShortName}
                            variant="spaced"
                            onClick={() => { onLiveRouteClick?.(r.slug, r.displayRouteShortName); onClose(); }}
                            className="justify-start gap-2"
                          >
                            <Radio className="w-3 h-3 text-[var(--accent)] shrink-0" />
                            <span className="text-xs text-[var(--text-primary)]">{liveRouteLabel(r)}</span>
                          </ListRow>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedHistory && (
                    <div>
                      <div className="mb-2">
                        <Tag className="inline-block">History</Tag>
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
