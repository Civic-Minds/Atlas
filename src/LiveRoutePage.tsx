import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES, periodKeyForHour } from '../shared/config';
import {
  branchFigures, branchRunTimeLine, runTimeStretchLabel, runTimeTakeaway, freshness, rankStops, runningTimeSentence,
  type DashboardBand, type DashboardBandData, type LiveDashboardResponse, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveGaps } from './hooks/useLiveGaps';
import { devOnly, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { shortStopName } from './utils/stopLabel';
import { liveChartHours } from './utils/sparklinePeriods';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import SortableDataTable from './components/ui/SortableDataTable';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import LiveOffNotice from './components/LiveOffNotice';
import LiveDashboardView from './LiveDashboardView';
import LiveExplorePage from './LiveExplorePage';
import HourBars from './components/charts/HourBars';
import { KpiRow } from './LiveDashboardView';
import RunTimeChart, { runTimeScale } from './components/charts/RunTimeChart';
import { TILE } from './pageStyles';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { LATE_BY_HOUR_TITLE, lateCount, lateHourLine, liveSubtitle } from '../shared/liveWording';
import Section from './components/Live/sections/Section';
import MethodSection from './components/Live/sections/MethodSection';
import BuildupSection from './components/Live/sections/BuildupSection';
import BunchingSection from './components/Live/sections/BunchingSection';
import DeliveredSection from './components/Live/sections/DeliveredSection';
import ExtraWaitSection from './components/Live/sections/ExtraWaitSection';
import { dirsOf, mins, pct } from './components/Live/sections/figures';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];

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


function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={TILE}>
      <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-dim)]">{sub}</div>
    </div>
  );
}

function Filters({ v3, dir, setDir }: { v3: LiveV3; dir: number | null; setDir: (d: number | null) => void }) {
  const dirs = dirsOf(v3, null);
  return (
    <div className={`mt-5 ${PILL_ROW}`} role="group" aria-label="Filters">
      <PillGroup label="Direction" value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
        options={[['both', 'Both directions'], ...dirs.map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
    </div>
  );
}

/** B1: how well the route keeps to its timetable, at timepoints (where the timetable really schedules a time). */
function Adherence({ data, dir, lateMin }: { data: DashboardBandData; dir: number | null; lateMin: number }) {
  const countsFor = (d: Day) => { const b = data.adherence.timepoints[d]; return dir == null ? b.overall : b.byDirection[String(dir)]; };
  const all = countsFor('all');
  const parts = [{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }];
  return (
    <Section id="b1" title={LATE_BY_HOUR_TITLE}>
      {all && all.n > 0 ? (
        <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Share of trips that left the end of the line more than 5 min late.</p>
          <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
            {DAYS.map(([k, label]) => {
              const c = countsFor(k);
              return c && c.n > 0
                ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} />
                : <Tile key={k} label={label} value="–" sub="too few departures" />;
            })}
          </div>
          <h3 className="mt-6 text-base font-black">By hour of the day</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">How many departures are ahead, on time or late in each hour. Hover over an hour to see its time of day.</p>
          <div className="mt-3 grid gap-6 md:grid-cols-3">
            {DAYS.map(([k, label]) => {
              const c = countsFor(k);
              const axis = liveChartHours(h => DAYS.some(([d]) => (data.adherence.timepoints[d].byHour.find(x => x.hour === h)?.n ?? 0) >= 30));
              return (
                <HourBars
                  hoverLine={(t, c) => lateHourLine(t, lateCount(c.parts[2], c.n), c.n)}
                  departures
                  hours={axis}
                  key={k}
                  title={label}
                  showKey={k === 'weekend'}
                  ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${c ? pct(c.lateShare) : '–'} late overall.`}
                  parts={parts}
                  columns={data.adherence.timepoints[k].byHour.map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
                />
              );
            })}
          </div>
        </>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>}
    </Section>
  );
}

/** B2: stops with the most delay, ranked by how often vehicles leave 5.5+ min late. One table with a small bar in each row. */
function WorstStops({ v3, data, dir, uncertain }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[] }) {
  const ranked = useMemo(() => rankStops(data.stops, dir, uncertain), [data, dir, uncertain]);
  const top = ranked.slice(0, 10);
  const both = dir == null;
  const hidden = uncertain.filter(u => dir == null || u.directionId === dir);
  return (
    <Section id="b2" title="Stops with the most delay">
      <p className="mt-2 text-sm text-[var(--text-muted)]">Stops ranked by how often vehicles leave {v3.thresholds.lateAtOrAboveMin}+ minutes late (stops with 30+ departures).</p>
      {top.length ? (
        <div className="mt-4 overflow-x-auto">
          <SortableDataTable
            caption="Stops ranked by the share of late departures"
            defaultSort="late"
            rows={top}
            rowKey={s => `${s.stopId}-${s.directionId}`}
            columns={[
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: s => <span title={s.name}>{s.name}</span> },
              ...(both ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof top)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
              { key: 'late', header: 'Late', worst: s => s.lateShare, cell: s => (
                <span className="inline-flex items-center gap-2">
                  <span className="block h-2 w-20 rounded-sm bg-[var(--control-inactive-bg)]" aria-hidden="true"><span className="block h-full rounded-sm bg-[var(--accent)] opacity-90" style={{ width: `${Math.max(2, s.lateShare * 100)}%` }} /></span>
                  {pct(s.lateShare)}
                </span>
              ) },
              { key: 'median', header: 'Typical delay', worst: s => s.medianMin, cell: s => mins(s.medianMin) },
              { key: 'p90', header: '1 in 10 later than', width: 10, worst: s => s.p90Min, cell: s => mins(s.p90Min) },
              { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
            ]}
          />
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>}
      {hidden.length > 0 && (
        <p className="mt-2 max-w-2xl text-xs text-[var(--text-dim)]">
          Not ranked: the first {hidden[0].stops} stops {hidden.length === 1 ? v3.directionLabels[String(hidden[0].directionId)].toLowerCase() : 'in some directions'}, where delay is less exact (see the note above).
        </p>
      )}
    </Section>
  );
}

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

/** How long the whole trip takes against the timetable, by direction and hour. */
function RunningTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  if (!rt) return null;
  const dirs = dirsOf(v3, dir);
  const hoursOf = (d: number) => (rt.byHour[String(d)] ?? []).filter(h => h.n >= 1 && (band === 'all' || periodKeyForHour(h.hour) === band));
  const scale = runTimeScale(dirs.map(hoursOf));
  return (
    <Section id="runtime" title="Run time">
      <p className="mt-2 text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, by the hour it starts, over the stops every regular trip serves, so short turns count too.</p>
      <div className={`mt-4 grid gap-6 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {dirs.map(d => {
          const label = v3.directionLabels[String(d)];
          const figures = rt.bands[band]?.[String(d)];
          const hours = hoursOf(d);
          const axis = liveChartHours(h => dirs.some(dd => hoursOf(dd).some(x => x.hour === h && x.n >= 5)));
          return (
            <div key={d} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              {runTimeStretchLabel(rt.stretch?.[String(d)], n => shortStopName(titleCase(n))) && <p className="text-sm text-[var(--text-muted)]">{runTimeStretchLabel(rt.stretch?.[String(d)], n => shortStopName(titleCase(n)))}</p>}
              <p className="mt-1 text-sm leading-6">{withoutDevHint(runningTimeSentence(label, figures))}</p>
              {hours.length > 1 && (
                <>
                  <p className="mt-1 text-sm font-bold">{runTimeTakeaway(label, hours)}</p>
                  <div className="mt-2"><RunTimeChart hours={hours} axis={axis} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts. ${withoutDevHint(runningTimeSentence(label, figures))}`} /></div>
                </>
              )}
              {(rt.branches?.[String(d)] ?? []).length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-black">Longer patterns, each end to end</h4>
                  <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
                    {rt.branches![String(d)].flatMap(b => { const f = branchFigures(b, band); return f ? [<li key={`${b.fromStopId}-${b.toStopId}`} className={f.n < 30 ? 'text-[var(--text-dim)]' : ''}>{branchRunTimeLine(b, n => shortStopName(titleCase(n)), f)}{f.n < 30 ? ' Few trips: treat with care.' : ''}</li>] : []; })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** The route pages' subtitle (full analysis and explore): the week, the trip count, where the figures come from. */
export function routeSubtitle(v3: LiveV3, agency: string): string {
  const w = v3.weekly;
  return liveSubtitle({ thisWeek: v3.window.dates, lastWeek: w?.comparable ? w.lastWeek.dates : null, middle: `${v3.totals.runs.toLocaleString()} trips`, agency });
}

export const BOUNDARY = (what: string) => withoutDevHint(`${what} could not be drawn: the analysis file may be from an older version. Rebuild it with npm run live:analyze.`);

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
          return f.stale ? <p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{withoutDevHint(f.text)}</p> : null;
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
        <ErrorBoundary label={BOUNDARY(LATE_BY_HOUR_TITLE)}><Adherence data={bandData} dir={dir} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Run time')}><RunningTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Where delays build up')}><BuildupSection v3={v3} data={bandData} dir={dir} uncertain={uncertain} detail="full" /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Stops with the most delay')}><WorstStops v3={v3} data={bandData} dir={dir} uncertain={uncertain} /></ErrorBoundary>
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
