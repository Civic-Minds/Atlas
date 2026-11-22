import { useEffect, useState } from 'react';
import { MAP_BADGE, MAP_BADGE_LABEL } from './styles';
import { dateRange } from '../shared/dateText';
import { useParams } from 'react-router';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import {
  freshness, goodDayCounts,
  type DashboardBand, type DashboardBandData, type LiveDashboardResponse, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { useLiveDashboard, liveAgencyPath, liveToolPath } from './hooks/useLiveDashboard';
import { useLiveGaps } from './hooks/useLiveGaps';
import { devOnly, liveReportTitle, liveRouteTitleLabel } from './lib/liveReportData';
import { RouteTitleName } from './components/RouteRowName';
import DevHint from './components/Live/DevHint';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_ROUTE_URL, currentSearch, linkUpdate, readUrlParam } from './utils/urlSchema';
import { nameCase } from './utils/format';
import ErrorBoundary from './components/ErrorBoundary';
import DocsPageLayout from './components/ui/DocsPageLayout';
import EmptyPage from './components/ui/EmptyPage';
import LiveOffNotice from './components/LiveOffNotice';
import LiveDashboardView from './LiveDashboardView';
import LiveExplorePage from './LiveExplorePage';
import { KpiRow } from './LiveDashboardView';
import ArrowLink from './components/ui/ArrowLink';
import LiveBackLink from './components/Live/LiveBackLink';
import { PageTitle } from './components/ui/PageTitle';
import { BUNCHING_FORMS_TITLE, DELAY_STARTS_TITLE, EXTRA_WAIT_LABEL, LATE_BY_HOUR_TITLE, LATE_STOPS_TITLE, OPEN_LIVE_LABEL, SERVICE_DELIVERED_TITLE, TRIP_TIME_LABEL, VIEW_ON_LIVE_MAP, WEEK_COMPARE_TITLE, excludingText, liveSubtitle } from '../shared/liveWording';
import Section from './components/Live/sections/Section';
import MethodSection from './components/Live/sections/MethodSection';
import LateByHourSection, { routeLeftOut } from './components/Live/sections/LateByHourSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import BuildupSection from './components/Live/sections/BuildupSection';
import BunchingSection from './components/Live/sections/BunchingSection';
import DeliveredSection from './components/Live/sections/DeliveredSection';
import ExtraWaitSection from './components/Live/sections/ExtraWaitSection';
import { LIVE_METHOD_DRAW_ERROR, liveDrawError, liveNoRoute, loadingText } from './content/noticeCopy';
import { LATE_MAP_STOPS } from './components/Live/lateStopsMapModel';
import { countText } from '../shared/numberText';
import { LIVE_PATH } from '../shared/pagePaths';


/** The stop-name fields of a v3 file; every one of them is shown in normal case. */
const NAME_KEYS = new Set(['name', 'fromName', 'toName']);
/** Big per-stop number tables that hold no names, left alone. */
const NO_NAMES = new Set(['stopHours', 'segmentLines']);
const niceDeep = (x: unknown, key = ''): unknown => {
  if (typeof x === 'string') return NAME_KEYS.has(key) ? nameCase(x, 'liveStop') : x;
  if (Array.isArray(x)) return x.map(v => niceDeep(v, key));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, NO_NAMES.has(k) ? v : niceDeep(v, k)]));
  return x;
};
/**
 * Stop names come upper-case or mixed from the feed (the TTC analysis has "RONCESVALLES AVE AT HOWARD PARK AVE SOUTH SIDE");
 * this is the one place every Live surface gets them in normal case, wherever a name sits in the file (stops, bands, build-up,
 * bunching, extra wait, patterns, run time stretches and branches).
 */
export function withNiceNames(v3: LiveV3): LiveV3 {
  return niceDeep(v3) as LiveV3;
}

export type Ready = Extract<LiveDashboardResponse, { status: 'ready' }>;


/** This week against last week: five tiles, each a number, a label and a change chip coloured only beyond normal noise. */
function WeekCompare({ v3 }: { v3: LiveV3 }) {
  // The dashboard's own tiles (labels, change chips, noise rule), so the two views always match.
  return (
    <Section id="week" title={WEEK_COMPARE_TITLE}>
      <KpiRow v3={v3} />
    </Section>
  );
}

/** The route pages' subtitle (full analysis and explore): the week, the trip count, where the figures come from. */
export function routeSubtitle(v3: LiveV3, /** The agency's short name (useLiveAgencyName). */ agencyName: string): string {
  const w = v3.weekly;
  // CIV-1445: "Week of" and its trip count cover this week only, the trips the Late tile counts. A file with no weekly
  // figures still names its whole window.
  const thisWeek = w?.thisWeek.dates.length ? w.thisWeek.dates : v3.window.dates;
  const trips = w?.thisWeek.late ? w.thisWeek.late.n : goodDayCounts(v3).runs;
  return liveSubtitle({ thisWeek, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: `${countText(trips)} trips`, agency: agencyName, upTo: v3.window.dates[v3.window.dates.length - 1] });
}

/**
 * The subtitle line. Its "data up to Oct 14" segment stays the line's own plain grey, as the pill does (Ryan, CIV-2007:
 * the date says it). When the analysis is stale it carries role=status, and the age ("Data up to Oct 14, 3 days ago.")
 * is its hover text, not a line of its own.
 */
export function RouteSubtitle({ v3, agency, route }: { v3: LiveV3; agency: string; route: string }) {
  const f = freshness(v3, route, Date.now());
  const line = routeSubtitle(v3, useLiveAgencyName(agency));
  const at = line.lastIndexOf(' · data up to ');
  if (!f.stale) return <>{line}</>;
  if (at < 0) return <>{line}{line ? ' · ' : ''}<span role="status" title={f.text}>{f.text}</span></>;
  return <>{line.slice(0, at)} · <span role="status" title={f.text}>{line.slice(at + 3)}</span></>;
}

/**
 * "data up to Oct 14" alone, for a header with no subtitle line (the tool). The date alone, always plain grey (Ryan,
 * CIV-2007); when the analysis is stale it keeps role=status and the age as its hover text.
 */
export function DataUpTo({ dates, route = '', pill = false }: { dates: readonly string[]; route?: string; /** In the map's pill (MAP_BADGE), as the loading pill. */ pill?: boolean }) {
  const last = dates[dates.length - 1];
  if (!last) return null;
  const f = freshness({ window: { dates } } as LiveV3, route, Date.now());
  const text = `Data up to ${dateRange(last, last)}`;
  if (pill) {
    return (
      <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`} {...(f.stale ? { role: 'status', title: f.text } : {})}>
        <span className={MAP_BADGE_LABEL}>{text}</span>
      </div>
    );
  }
  return <span className="text-sm text-[var(--text-muted)]" {...(f.stale ? { role: 'status', title: f.text } : {})}>{text}</span>;
}

/** The rebuild command for a stale analysis: developer hints only (?dev=1), under the header. */
export function RouteDevHint({ v3, route }: { v3: LiveV3; route: string }) {
  return <DevHint hint={freshness(v3, route, Date.now()).devHint} className="mt-2" />;
}

export const BOUNDARY = liveDrawError;

/**
 * CIV-284 (Ryan: "1 but don't delete or edit any of the content in each page yet"): Full analysis's sections, exactly as
 * they were, now drawn in the Full report (LiveExplorePage) below the Dashboard's. Always the whole day.
 */
export function FullAnalysisSections({ v3, dir, uncertain, gaps, agency, route }: { v3: LiveV3; dir: number | null; uncertain: UncertainStart[]; gaps: ReturnType<typeof useLiveGaps>; agency: string; route: string }) {
  const band: DashboardBand = 'all';
  const bandData = v3.bands?.[band] as DashboardBandData;
  return (<>
        <ErrorBoundary label={BOUNDARY(WEEK_COMPARE_TITLE)}><WeekCompare v3={v3} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="bars" id="b1" title={LATE_BY_HOUR_TITLE} v3={v3} data={bandData} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(TRIP_TIME_LABEL)}><RunTimeSection v3={v3} band={band} dir={dir} detail="full" id="runtime" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(DELAY_STARTS_TITLE)}><BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(LATE_STOPS_TITLE)}><WorstStopsSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} limit={LATE_MAP_STOPS} map={{ agency, route }} columns="full" title={LATE_STOPS_TITLE} id="b2" intro notRanked /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(EXTRA_WAIT_LABEL)}><ExtraWaitSection v3={v3} band={band} dir={dir} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(BUNCHING_FORMS_TITLE)}><BunchingSection v3={v3} dir={dir} band={band} gaps={gaps} detail="full" uncertain={uncertain} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(SERVICE_DELIVERED_TITLE)}><DeliveredSection v3={v3} dir={dir} detail="full" /></ErrorBoundary>
  </>);
}

/** The Summary (CIV-284): the route page's default, and every shared link's landing page. Its Full report link opens the Full report. */
function SummaryPage({ onFull }: { onFull: (hash: string) => void }) {
  const { agency = '', route = '' } = useParams();
  const agencyName = useLiveAgencyName(agency);
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  // The whole day, both directions; a direction in the address is kept for the Full report it links to.
  const [dir] = useState<number | null>(() => readUrlParam(currentSearch(), LIVE_ROUTE_URL.dir) ?? null);
  useEffect(() => { syncUrlParams(linkUpdate(LIVE_ROUTE_URL, { band: null, day: null, dir, view: 'lite' })); }, [dir]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agencyName} ${route}`, true), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agencyName, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice report />;
  const title = `${agencyName} ${route}`;
  const back = FEATURES.live ? <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink> : null;
  // CIV-1446: every route page, loaded or not (a route held back, an unknown route), leads back to the agency's page.
  const toAgency = <LiveBackLink agencyName={agencyName} href={liveAgencyPath(agency)} />;
  if (state.kind === 'loading') return <DocsPageLayout width="wide"><div className="mt-24">{toAgency}</div><p className="mt-2 text-sm text-[var(--text-muted)]" aria-busy="true">{loadingText(title)}</p></DocsPageLayout>;
  if (state.kind === 'error') return <EmptyPage title={title} body={state.reason} action={back} above={toAgency} />;
  const data = state.data;
  if (data.status !== 'ready') {
    return <EmptyPage title={title} body={data.status === 'no_analysis' ? devOnly(data.reason) : data.status === 'unknown_route' ? liveNoRoute(route, agencyName) : data.reason} action={back} above={toAgency} />;
  }
  // A malformed file must not blank the page: fall back to the raw names and let each section's boundary report its own problem.
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const uncertain = data.uncertainStart ?? [];
  return (
    <DocsPageLayout width="wide">
        <div className="mb-2">{toAgency}</div>
        <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
          <div className="min-w-0"><PageTitle>{data.routeTitle ? <RouteTitleName label={liveRouteTitleLabel(data.routeTitle, route)} /> : title}</PageTitle></div>
          <p className="m-0 text-sm text-[var(--text-muted)] sm:col-span-2 sm:row-start-2">
            <RouteSubtitle v3={v3} agency={agency} route={route} />
          </p>
          {FEATURES.liveReports && <ArrowLink href={liveToolPath(agency, route)} className="mt-3 shrink-0 whitespace-nowrap sm:col-start-2 sm:row-start-1 sm:mt-0">{VIEW_ON_LIVE_MAP}</ArrowLink>}
        </div>
        <RouteDevHint v3={v3} route={route} />
        {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        <LiveDashboardView lite v3={v3} data={v3.bands.all} band="all" dir={dir} uncertain={uncertain} filters={null} toFull={onFull} />
        {/* One METHOD_TITLE for the Summary and the Full report alike, every line of the method (CIV-308). */}
        {/* #1490: the Summary names the left-out days on late by hour (its All days note); the method doesn't repeat them. */}
        <ErrorBoundary label={LIVE_METHOD_DRAW_ERROR}><MethodSection scope="route" data={data} namedAbove={excludingText(routeLeftOut(v3))} /></ErrorBoundary>
    </DocsPageLayout>
  );
}

/** The views that open the Full report (LiveExplorePage): its own, and the retired Dashboard's and Full analysis's (CIV-284). */
const FULL_REPORT_VIEWS: ReadonlySet<string> = new Set(['explore', 'dashboard', 'analysis']);

/** ?view=explore (and the old dashboard and analysis views) opens the Full report; everything else is the Summary above. */
export default function LiveRoutePage() {
  const [full, setFull] = useState(() => FULL_REPORT_VIEWS.has(readUrlParam(currentSearch(), LIVE_ROUTE_URL.view) ?? ''));
  const openFull = (hash: string) => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`);
    setFull(true);
  };
  return full ? <LiveExplorePage /> : <SummaryPage onFull={openFull} />;
}
