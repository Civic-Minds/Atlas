import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Search, Radio } from 'lucide-react';
import { DROPDOWN_PANEL, dropdownAnim, SEARCH_PILL, SEARCH_ICON, SEARCH_FIELD, AGENCY_LIST_FILTERS, PILL_SCROLL_ROW, Z_MODAL_BG, AGENCY_LIST_PRIMARY } from '../styles';
import Pill from './ui/Pill';
import LinkCard from './ui/LinkCard';
import Tag from './ui/Tag';
import PanelEmpty from './ui/PanelEmpty';
import AgencyName from './ui/AgencyName';
import { LIVE_POLLING_ROUTES, liveCoverageForRouteNames, type LiveCoverage } from '../../shared/livePollingConfig';
import { R2_PUBLIC_URL, FEATURES as BASE_FEATURES } from '../../shared/config';
import { PHONE_MEDIA_QUERY, phoneModeFlags, useMediaQuery } from '../hooks/useMediaQuery';
import { formatStoredDate, routeLabelCase } from '../utils/format';
import { agencyNames } from '../utils/agencyName';
import { feedRefreshCountdownLabel, type FeedRefreshMeta } from '../../shared/feedRefresh';
import { agencyQualifiesForHistory, agencyQualifiesForHistoryExplore } from '../../shared/historyEligibility';
import { countriesForAgencies } from '../../shared/regionCountry';
import { countOf, joinList } from '../../shared/overflowText';
import type { Agency } from '../App';
import { isAgencyFeedExpired } from '../../shared/feedAvailability';
import { trackEvent } from '../lib/analytics';
import { OutboundLink } from './OutboundLink';
import { betaRolloutLead, EDGE_GAP_ALLOWANCE_LEAD, EXPIRED_FEED_EXPLANATION, expiredFeedCheckHistory, expiredFeedNotice, EXPLAINER_LAYOUT, EXPLAINER_PIECES, EXPLAINERS, type ExplainerLayoutKey, type ExplainerLink, type HelpTopic, listingEndedPanelLead, newScheduleDataLead, NO_AGENCIES_MATCH, NO_ROUTE_SHAPE_NOTICE, pieceText, PRIVACY_SETTINGS_TITLE, ROUTE_DATA_QUALITY_LEAD, WEEKDAY_VARIATION_LEAD } from '../content/noticeCopy';
import RegionFilterPills from './RegionFilterPills';
import ListRow from './ui/ListRow';
import { AgencyList, AgencyListRow, AgencyRegionSection } from './ui/AgencyList';
import { compareAgencyName, compareRegion } from '../utils/sortCompare';
import { PANEL_HEADER_BAR, PANEL_HEADER_TITLE, PanelBackButton, PanelCloseButton } from './ui/PanelHeader';

interface HistoryAgencySummary { slug: string; name: string; region: string; routes: unknown[] }

type View = 'home' | 'agencies' | 'agency-detail' | 'outdated-schedule' | 'new-schedule-data' | 'corrected-data' | 'beta-rollout' | 'route-data-quality' | 'no-route-shape' | 'edge-gap-allowance' | 'weekday-variation' | 'sources';
export type Tab = 'about' | 'agencies' | 'history' | 'live';
export type InfoFeatureFilter = 'all' | 'live' | 'history';
type AgencyListFilter = InfoFeatureFilter | 'outdated';
export type { HelpTopic };
export type HelpContext = {
  topic: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  /** N25 (CIV-1055): set when opened from the listing-ended notice; the panel shows its variant. */
  listingEndedDate?: string;
  /** Whether that date has arrived (agency-local): 'ended', else 'ends'. */
  listingEnded?: boolean;
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
};
export type OpenInfoOptions = {
  featureFilter?: 'live' | 'history';
  helpTopic?: HelpTopic;
  agencyName?: string;
  expDateStr?: string;
  /** N25 (CIV-1055): set when opened from the listing-ended notice; the panel shows its variant. */
  listingEndedDate?: string;
  /** Whether that date has arrived (agency-local): 'ended', else 'ends'. */
  listingEnded?: boolean;
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
};
export type OpenInfoFn = (tab?: Tab, opts?: OpenInfoOptions) => void;

export function liveRouteLabel(r: { displayRouteShortName: string; displayName?: string }): string {
  if (r.displayName) return routeLabelCase(r.displayName);
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

/** One explainer: its own paragraph 1, then the pieces its layout names (EXPLAINER_LAYOUT), then their links. */
function ExplainerBody({ layout, lead, p2After = '', helpContext }: { layout: ExplainerLayoutKey; lead: string; p2After?: string; helpContext?: HelpContext | null }) {
  const { p2, p3 } = EXPLAINER_LAYOUT[layout];
  const last: { text: string; links?: readonly ExplainerLink[]; needsWebsite?: boolean } | null = p3 ? EXPLAINER_PIECES[p3] : null;
  const showLast = !!last && (!last.needsWebsite || !!helpContext?.websiteUrl);
  const issueUrls = [...(helpContext?.issueUrls ?? []), ...(helpContext?.issueUrls?.length ? [] : [helpContext?.issueUrl])]
    .filter((url): url is string => !!url);
  const link = (kind: ExplainerLink) => {
    if (kind === 'agency-website') return helpContext?.websiteUrl
      ? <LinkCard key={kind} as={OutboundLink} href={helpContext.websiteUrl} kind="agency_website" icon="external">Check current schedules</LinkCard>
      : null;
    if (kind === 'technical-details') return issueUrls.map((url, index) => {
      const issueNumber = url.match(/\/issues\/(\d+)/)?.[1];
      return (
        <LinkCard key={url} href={url} target="_blank" rel="noreferrer" icon="external">
          {issueNumber ? `Technical details (#${issueNumber})` : `Technical details ${index + 1}`}
        </LinkCard>
      );
    });
    const data = kind === 'report-data';
    return (
      <LinkCard key={kind} href={`mailto:hey@ryanisnota.pro?subject=Atlas%20${data ? 'data' : 'schedule'}%20feedback`}
        onClick={() => trackEvent('feedback_opened', { source: data ? 'info_panel_data' : 'info_panel_schedule' })} icon="mail">Report a problem</LinkCard>
    );
  };
  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
      {lead && <p className="text-xs text-[var(--text-primary)] leading-relaxed">{lead}</p>}
      <p className="text-xs text-[var(--text-dim)] leading-relaxed">{[...p2.map(pieceText), p2After].filter(Boolean).join(' ')}</p>
      {showLast && <p className="text-xs text-[var(--text-dim)] leading-relaxed">{last.text}</p>}
      {showLast && last.links?.map(link)}
    </div>
  );
}

export default function InfoPanel({ open, onClose, agencies, defaultTab, featureFilter = 'all', helpContext, feedRefreshMeta, onAgencySelect, onLiveRouteClick, layers }: Props) {
  // History is not offered on phones, so its filter, badges and wording step aside there.
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const FEATURES = { ...BASE_FEATURES, history: BASE_FEATURES.history && phoneModeFlags(isPhone).history };
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
        || (filter === 'outdated' && isAgencyFeedExpired(a))
      )) continue;
      seen.add(a.region ?? 'Other');
    }
    return [...seen].sort(compareRegion);
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
        || (filter === 'outdated' && isAgencyFeedExpired(a))
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
      list.sort((a, b) => compareAgencyName(a.name, b.name) || a.slug.localeCompare(b.slug));
    }
    return new Map([...map.entries()].sort(([a], [b]) => compareRegion(a, b)));
  }, [filtered]);

  const totalLiveAgencies = liveBySlug.size;
  const agencyFilterOptions: Array<[AgencyListFilter, string]> = [
    ['all', 'All'],
    ['live', 'Live'],
    ...(FEATURES.history ? [['history', 'History'] as [AgencyListFilter, string]] : []),
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
    : view in EXPLAINERS ? EXPLAINERS[view as HelpTopic].title
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
        <div className={`${PANEL_HEADER_BAR} relative overflow-hidden`}>
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
            <PanelBackButton
              onClick={() => {
                if (view === 'agency-detail') setView('agencies');
                else setView('home');
              }}
              label={view === 'agency-detail' ? 'Back to agencies' : 'Back'}
            />
            <h2 className={`${PANEL_HEADER_TITLE} truncate min-w-0`}>
              {headerTitle}
            </h2>
          </div>

          <div className="flex-1" />
          <PanelCloseButton onClick={onClose} className="z-10" label="Close" />
        </div>

        {/* Content View Container */}
        <div className="flex-1 overflow-hidden relative">
          {view === 'home' && (
            <div className="h-full flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
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
                <LinkCard as="button" onClick={() => window.dispatchEvent(new Event('atlas:privacy-settings'))}>{PRIVACY_SETTINGS_TITLE}</LinkCard>
              </div>

            </div>
              {/* Pinned to the panel's bottom edge, below the scrolling content. */}
              <div className="shrink-0 border-t border-[var(--border-primary)] px-5 py-3 text-xs text-[var(--text-dim)] space-y-1" data-testid="info-panel-footer">
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
              <div className={AGENCY_LIST_FILTERS}>
                <div className={SEARCH_PILL}>
                  <Search className={SEARCH_ICON} />
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
                <div className={PILL_SCROLL_ROW} style={{ scrollbarWidth: 'none' }}>
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
                  <PanelEmpty>{NO_AGENCIES_MATCH}</PanelEmpty>
                ) : (
                  <AgencyList>
                    {[...byRegion.entries()].map(([region, list]) => (
                      <AgencyRegionSection key={region} region={region}>
                        {list.map(a => {
                          const hasLive = liveBySlug.has(a.slug);
                          const hasHistory = historyBySlug.has(a.slug);
                          // The active status filter already explains why these rows are present.
                          // Repeating that same status on every row makes the filter feel inactive.
                          const showLiveBadge = FEATURES.live && hasLive && !agencyFeatureFilters.has('live');
                          const showHistoryBadge = FEATURES.history && hasHistory && !agencyFeatureFilters.has('history');
                          const { primary, secondary } = agencyNames({ name: a.name, cities: a.cities, displayArea: a.displayArea }).list;
                          const listLabel = secondary ? `${primary} · ${secondary}` : primary;
                          return (
                            <AgencyListRow
                              key={a.slug}
                              primary={primary}
                              secondary={secondary}
                              title={listLabel}
                              onClick={() => { onAgencySelect?.(a.slug); onClose(); }}
                              tags={(showLiveBadge || showHistoryBadge) ? (
                                <>
                                  {showLiveBadge && (
                                    <Tag title={liveCoverageBySlug.has(a.slug) ? undefined : 'Live route coverage is still loading.'}>
                                      {liveCoverageBySlug.get(a.slug) === 'full' ? 'Full live' : liveCoverageBySlug.get(a.slug) === 'partial' ? 'Partial live' : 'Live routes'}
                                    </Tag>
                                  )}
                                  {showHistoryBadge && <Tag>History</Tag>}
                                </>
                              ) : undefined}
                            />
                          );
                        })}
                      </AgencyRegionSection>
                    ))}
                  </AgencyList>
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

          {/* Explainers (CIV-1061): paragraph 1 is each one's own; paragraphs 2 and 3 are shared pieces. */}
          {view === 'outdated-schedule' && (() => {
            const checkHistory = expiredFeedCheckHistory({
              count: helpContext?.expiredFeedCheckCount,
              since: helpContext?.expiredFeedCheckSince,
              lastChecked: helpContext?.lastFeedCheckAt,
              lastRefreshed: helpContext?.lastRefreshedAt,
            });
            return (
              // E1, N25 version (Ryan, CIV-1051): its own paragraph 1, then N2's paragraphs 2 and 3.
              <ExplainerBody
                layout={!helpContext?.listingEndedDate && helpContext?.manualFeedSource ? 'outdated-schedule-manual' : 'outdated-schedule'}
                lead={helpContext?.listingEndedDate
                  ? listingEndedPanelLead(helpContext.agencyName ?? 'This agency', helpContext.listingEndedDate, helpContext.listingEnded ?? true)
                  : `${helpContext?.agencyName ? `${expiredFeedNotice(helpContext.agencyName, helpContext.expDateStr, helpContext.manualFeedSource)} ` : ''}${EXPIRED_FEED_EXPLANATION}`}
                p2After={helpContext?.agencyName || helpContext?.listingEndedDate ? checkHistory : ''}
                helpContext={helpContext}
              />
            );
          })()}
          {view === 'edge-gap-allowance' && <ExplainerBody layout="edge-gap-allowance" lead={EDGE_GAP_ALLOWANCE_LEAD} helpContext={helpContext} />}
          {view === 'weekday-variation' && <ExplainerBody layout="weekday-variation" lead={WEEKDAY_VARIATION_LEAD} helpContext={helpContext} />}
          {view === 'new-schedule-data' && (
            <ExplainerBody layout="new-schedule-data" helpContext={helpContext}
              lead={helpContext?.agencyName ? newScheduleDataLead(helpContext.agencyName, helpContext.lastRefreshedAt ? formatStoredDate(helpContext.lastRefreshedAt) : null) : ''} />
          )}
          {view === 'corrected-data' && (
            <ExplainerBody layout="corrected-data" helpContext={helpContext}
              lead={helpContext?.agencyName && helpContext.overrideNote ? helpContext.overrideNote : ''} />
          )}
          {view === 'beta-rollout' && (
            <ExplainerBody layout="beta-rollout" helpContext={helpContext} lead={helpContext?.agencyName ? betaRolloutLead(helpContext.agencyName) : ''} />
          )}
          {view === 'route-data-quality' && <ExplainerBody layout="route-data-quality" lead={ROUTE_DATA_QUALITY_LEAD} helpContext={helpContext} />}
          {view === 'no-route-shape' && <ExplainerBody layout="no-route-shape" lead={NO_ROUTE_SHAPE_NOTICE} helpContext={helpContext} />}

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
                        Historical frequency data available for {countOf(selectedHistory.routes.length, 'route')} {historyYearsText}.
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
