import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import {
  freshness,
  type DashboardBand, type DashboardBandData, type LiveDashboardResponse, type LiveV3,
} from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveGaps } from './hooks/useLiveGaps';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import DevHint from './components/Live/DevHint';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import LiveOffNotice from './components/LiveOffNotice';
import LiveDashboardView from './LiveDashboardView';
import LiveExplorePage from './LiveExplorePage';
import { KpiRow } from './LiveDashboardView';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { LATE_BY_HOUR_TITLE, liveSubtitle } from '../shared/liveWording';
import Section from './components/Live/sections/Section';
import MethodSection from './components/Live/sections/MethodSection';
import LateByHourSection from './components/Live/sections/LateByHourSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import BuildupSection from './components/Live/sections/BuildupSection';
import BunchingSection from './components/Live/sections/BunchingSection';
import DeliveredSection from './components/Live/sections/DeliveredSection';
import ExtraWaitSection from './components/Live/sections/ExtraWaitSection';
import { dirsOf, mins } from './components/Live/sections/figures';


/** Stop names come upper-case or mixed from the feed; show them the way the map does. */
export function withNiceNames(v3: LiveV3): LiveV3 {
  const t = titleCase;
  const stretch = <S extends { fromName: string; toName: string }>(x: S | null): S | null => (x ? { ...x, fromName: t(x.fromName), toName: t(x.toName) } : x);
  const bandData = (b: DashboardBandData): DashboardBandData => ({
    ...b,
    stops: b.stops.map(x => ({ ...x, name: t(x.name) })),
    buildup: b.buildup.map(d => ({ ...d, forms: stretch(d.forms), start: stretch(d.start), biggest: stretch(d.biggest), stretches: d.stretches.map(x => stretch(x)!) })),
  });
  return {
    ...v3,
    stops: v3.stops.map(x => ({ ...x, name: t(x.name) })),
    buildup: bandData({ stops: [], adherence: v3.adherence, buildup: v3.buildup }).buildup,
    bands: Object.fromEntries(Object.entries(v3.bands).map(([k, b]) => [k, bandData(b)])) as LiveV3['bands'],
    bunching: v3.bunching.map(d => ({ ...d, bands: Object.fromEntries(Object.entries(d.bands).map(([k, band]) => [k, { ...band, forms: stretch(band.forms), biggestRise: stretch(band.biggestRise), stops: band.stops.map(x => ({ ...x, name: t(x.name) })) }])) })),
  };
}
/** Axis value with its unit, with a real minus sign. */
const axisMin = mins;

export type Ready = Extract<LiveDashboardResponse, { status: 'ready' }>;


function Filters({ v3, dir, setDir }: { v3: LiveV3; dir: number | null; setDir: (d: number | null) => void }) {
  const dirs = dirsOf(v3, null);
  return (
    <div className={`mt-5 ${PILL_ROW}`} role="group" aria-label="Filters">
      <PillGroup label="Direction" value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
        options={[['both', 'Both directions'], ...dirs.map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
    </div>
  );
}

/** B2: stops with the most delay, ranked by how often vehicles leave 5.5+ min late. One table with a small bar in each row. */
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? 'a' : 'p'}`;

/** This week against last week: five tiles, each a number, a label and a change chip coloured only beyond normal noise. */
function WeekCompare({ v3 }: { v3: LiveV3 }) {
  // The dashboard's own tiles (labels, change chips, noise rule), so the two views always match.
  return (
    <Section id="week" title="This week compared with last week">
      <KpiRow v3={v3} />
    </Section>
  );
}

/** The route pages' subtitle (full analysis and explore): the week, the trip count, where the figures come from. */
export function routeSubtitle(v3: LiveV3, agency: string): string {
  const w = v3.weekly;
  return liveSubtitle({ thisWeek: v3.window.dates, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: `${v3.totals.runs.toLocaleString()} trips`, agency, upTo: v3.window.dates[v3.window.dates.length - 1] });
}

export const BOUNDARY = (what: string) => `${what} could not be drawn: the analysis file may be from an older version.`;

function AnalysisPage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  const gaps = useLiveGaps(FEATURES.liveReports ? agency : null, route);
  // No time-of-day toggle: every section shows the whole day; hour charts highlight a period on hover, and sections
  // whose answer differs by period list it per period.
  const band: DashboardBand = 'all';
  const [dir, setDir] = useState<number | null>(() => { const d = new URLSearchParams(window.location.search).get('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  // The filters live in the address, so a link reopens the same view.
  useEffect(() => { syncUrlParams({ band: null, day: null, dir: dir == null ? null : String(dir) }); }, [dir]);
  // The summary (lite) is the route page's default (CIV-284); ?view=lite still opens it. The dashboard stays at
  // ?view=dashboard for now, and ?view=analysis is the full page.
  const [view, setView] = useState<'dashboard' | 'analysis' | 'lite'>(() => { const v = new URLSearchParams(window.location.search).get('view'); return v === 'analysis' || v === 'dashboard' ? v : 'lite'; });
  useEffect(() => { syncUrlParams({ view: view === 'lite' ? null : view }); }, [view]);
  useEffect(() => {
    if (view !== 'analysis' || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [view, state.kind]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agency.toUpperCase()} ${route}`), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const title = `${agency.toUpperCase()} ${route}`;
  const back = FEATURES.live ? <ArrowLink href="/apps/live" className="mt-6">Open Live</ArrowLink> : null;
  if (state.kind === 'loading') return <PageShell variant="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {title}…</p></PageShell>;
  if (state.kind === 'error') return <PageShell variant="wide"><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{state.reason}</p>{back}</PageShell>;
  const data = state.data;
  if (data.status !== 'ready') {
    return (
      <PageShell variant="wide">
        <PageTitle className="mt-24">{title}</PageTitle>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>
        {back}
      </PageShell>
    );
  }
  // A malformed file must not blank the page: fall back to the raw names and let each section's boundary report its own problem.
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const bandData = v3.bands?.[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{data.routeTitle || title}</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {routeSubtitle(v3, agency)}
            </p>
          </div>
          {FEATURES.live && <ArrowLink href="/apps/live" className="shrink-0 whitespace-nowrap">View on Live map</ArrowLink>}
        </div>
        {(() => {
          const f = freshness(v3, route, Date.now());
          return f.stale ? <><p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{f.text}</p><DevHint hint={f.devHint} /></> : null;
        })()}
        {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        {view !== 'lite' && <div className={`mt-4 ${PILL_ROW}`}>
          <PillGroup label="View" value={view} onChange={v => setView(v as 'lite' | 'dashboard' | 'analysis')} options={[['lite', 'Summary'], ['dashboard', 'Dashboard'], ['analysis', 'Full analysis']]} />
        </div>}
        {view !== 'analysis' ? (
          <LiveDashboardView lite={view === 'lite'} v3={v3} data={v3.bands.all} band="all" dir={dir} uncertain={uncertain} note={data.note} title={title}
            filters={<Filters v3={v3} dir={dir} setDir={setDir} />}
            toFull={hash => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`); setView('analysis'); }} />
        ) : (<>
        <Filters v3={v3} dir={dir} setDir={setDir} />
        <ErrorBoundary label={BOUNDARY('This week compared with last week')}><WeekCompare v3={v3} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="bars" id="b1" title={LATE_BY_HOUR_TITLE} v3={v3} data={bandData} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Run time')}><RunTimeSection v3={v3} band={band} dir={dir} detail="full" id="runtime" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Where delays build up')}><BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Stops with the most delay')}><WorstStopsSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} limit={10} columns="full" title="Stops with the most delay" id="b2" intro notRanked p90Width={10} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Extra wait')}><ExtraWaitSection v3={v3} band={band} dir={dir} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Where bunching forms')}><BunchingSection v3={v3} dir={dir} band={band} gaps={gaps} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Service delivered')}><DeliveredSection v3={v3} dir={dir} detail="full" /></ErrorBoundary>
        <ErrorBoundary label="How this is measured could not be drawn."><MethodSection scope="route" data={data} /></ErrorBoundary>
        </>)}
      </article>
    </PageShell>
  );
}

/** ?view=explore opens the new full-analysis view (beta); everything else is the page above. */
export default function LiveRoutePage() {
  const [explore] = useState(() => new URLSearchParams(window.location.search).get('view') === 'explore');
  return explore ? <LiveExplorePage /> : <AnalysisPage />;
}
