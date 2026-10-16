import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';
import type { AgencyRouteRow, AgencySummary } from '../shared/liveAgency';
import { dateRangeText, type DashboardBand, type DashboardBandData, type LiveV3 } from '../shared/liveDashboard';
import { weekOfText } from '../shared/liveWording';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { RouteNameCell } from './pageParts';
import ErrorBoundary from './components/ErrorBoundary';
import LiveOffNotice from './components/LiveOffNotice';
import DirectionStrip, { directionStopsById } from './components/Live/DirectionStrip';
import { KpiRow } from './LiveDashboardView';
import { BOUNDARY, Method, withNiceNames } from './LiveRoutePage';
import {
  BANDS, DAYS, DetailPanel, Bunching, Buildup, Delivered, ExtraWait, Group, Late, RunTime, Section, WorstStops, dirsOf,
  type Day, type Selection,
} from './LiveExplorePage';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
/** A route got worse when its late share rose by at least this much since last week (the same fixed amount the tiles use for shares). */
const WORSE_BY = 0.02;
const readParam = (key: string) => new URLSearchParams(window.location.search).get(key);

interface Row { r: AgencyRouteRow; change: number | null }
const rowsOf = (s: AgencySummary): Row[] => s.routes.map(r => ({ r, change: r.lateShare != null && r.lateLastWeek != null ? r.lateShare - r.lateLastWeek : null }));

/** Every route with its late share, worst first, with the routes that got worse this week on top. */
function orderRoutes(s: AgencySummary): { worse: Row[]; rest: Row[] } {
  const all = rowsOf(s).sort((a, b) => (b.r.lateShare ?? -1) - (a.r.lateShare ?? -1) || a.r.route.localeCompare(b.r.route, undefined, { numeric: true }));
  const worse = all.filter(x => x.change != null && x.change >= WORSE_BY).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  return { worse, rest: all.filter(x => !worse.includes(x)) };
}

function RouteList({ s, route, onPick }: { s: AgencySummary; route: string; onPick: (route: string) => void }) {
  const { worse, rest } = useMemo(() => orderRoutes(s), [s]);
  const item = ({ r, change }: Row, isWorse: boolean) => {
    const on = r.route === route;
    const tone = isWorse ? 'text-[var(--status-negative-text)]' : 'text-[var(--text-dim)]';
    const line = change == null ? null : Math.round(change * 100) === 0 ? 'same as last week' : `${change > 0 ? '▲' : '▼'} from ${pct(r.lateLastWeek)} last week`;
    return (
      <li key={r.route} className="list-none">
        <button type="button" onClick={() => onPick(r.route)} aria-current={on ? 'true' : undefined}
          className={`flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm ${on ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
          <span className="min-w-0 truncate"><RouteNameCell shortName={r.route} longName={r.longName} mode={r.mode ?? 3} agencyName={s.agency.toUpperCase()} /></span>
          <span className="shrink-0 text-right">
            <span className="font-black tracking-tight">{pct(r.lateShare)}</span>
            {line && <span className={`block text-xs ${tone}`}>{line}</span>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Routes" className="min-h-0 overflow-y-auto px-2 pb-6">
      {worse.length > 0 && (
        <>
          <h2 className="px-3 pb-1 pt-3 text-sm font-black">Got worse this week</h2>
          <ul className="m-0 p-0">{worse.map(x => item(x, true))}</ul>
        </>
      )}
      <h2 className="px-3 pb-1 pt-4 text-sm font-black">All routes</h2>
      <ul className="m-0 p-0">{rest.map(x => item(x, false))}</ul>
    </nav>
  );
}

function RouteView({ agency, route, band, dir, day, setDay, sel, setSel }: {
  agency: string; route: string; band: DashboardBand; dir: number | null; day: Day; setDay: (d: Day) => void; sel: Selection | null; setSel: (s: Selection | null) => void;
}) {
  const state = useLiveDashboard(agency, route);
  if (state.kind === 'loading') return <p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()} {route}…</p>;
  if (state.kind === 'error') return <p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>;
  const data = state.data;
  if (data.status !== 'ready') return <p className="p-6 text-sm text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>;
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  return <Loaded key={`${agency}-${route}`} data={data} v3={v3} agency={agency} route={route} band={band} dir={dir} day={day} setDay={setDay} sel={sel} setSel={setSel} />;
}

function Loaded({ data, v3, agency, route, band, dir, day, setDay, sel, setSel }: {
  data: Extract<ReturnType<typeof useLiveDashboard>, { kind: 'done' }>['data'] & { status: 'ready' }; v3: LiveV3; agency: string; route: string; band: DashboardBand; dir: number | null;
  day: Day; setDay: (d: Day) => void; sel: Selection | null; setSel: (s: Selection | null) => void;
}) {
  const bandData = v3.bands[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  // A direction kept from another route may not exist on this one: show both.
  if (dir != null && !(String(dir) in v3.directionLabels)) dir = null;
  const dirs = dirsOf(v3, dir);
  // The panel opens on where delay builds up when the route has such a stretch, else on the first stop.
  const fallback: Selection = (() => {
    for (const d of dirs) if (bandData.buildup.find(b => b.directionId === d)?.forms) return { dir: d, kind: 'stretch', mode: 'delay' };
    return { dir: dirs[0], kind: 'stop', stopId: [...directionStopsById(v3, dirs[0], band, uncertain).keys()][0] };
  })();
  const shown: Selection = (() => {
    if (!sel || !dirs.includes(sel.dir)) return fallback;
    if (sel.kind === 'stretch') return (sel.mode === 'delay' ? bandData.buildup.find(b => b.directionId === sel.dir)?.forms : v3.bunching.find(b => b.directionId === sel.dir)?.bands[band]?.forms) ? sel : fallback;
    return directionStopsById(v3, sel.dir, band, uncertain).has(sel.stopId) ? sel : fallback;
  })();
  const stops = useMemo(() => directionStopsById(v3, shown.dir, band, uncertain), [v3, shown.dir, band, uncertain]);
  const pickStop = (d: number, stopId: string) => { if (directionStopsById(v3, d, band, uncertain).has(stopId)) setSel({ dir: d, kind: 'stop', stopId }); };
  const title = data.routeTitle || `${agency.toUpperCase()} ${route}`;
  const crumb = shown.kind === 'stop' ? stops.get(shown.stopId)?.name : null;
  const dates = v3.window.dates;
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-h-0 overflow-y-auto px-6 pb-16 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <a href={`/apps/live/${agency}`} className="font-bold hover:underline">{agency.toUpperCase()}</a>
          <span aria-hidden="true" className="text-[var(--text-dim)]">›</span>
          {crumb ? <button type="button" onClick={() => setSel(null)} className="font-bold hover:underline">{title}</button> : <span className="font-black">{title}</span>}
          {crumb && <><span aria-hidden="true" className="text-[var(--text-dim)]">›</span><span className="font-black">{crumb}</span></>}
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {dates.length ? `${weekOfText(dates[0], dates[dates.length - 1])} · ` : ''}{v3.totals.runs.toLocaleString()} trips · estimated from where vehicles were, not reported by {agency.toUpperCase()}
        </p>
        {data.note && <p className="mt-2 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        <ErrorBoundary label={BOUNDARY('This week compared with last week')}><KpiRow v3={v3} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Along the route')}>
          <div id="x-strip" className="mt-6 space-y-6">
            {dirs.map(d => (
              <div key={d} className="min-w-0">
                <h3 className="mb-1 text-base font-black">{v3.directionLabels[String(d)]}</h3>
                <DirectionStrip
                  v3={v3} directionId={d} band={band} uncertain={uncertain}
                  selectedId={shown.dir === d && shown.kind === 'stop' ? shown.stopId : null}
                  onSelect={stopId => setSel({ dir: d, kind: 'stop', stopId })}
                  selectedStretch={shown.dir === d && shown.kind === 'stretch' ? shown.mode : null}
                  onSelectStretch={mode => setSel({ dir: d, kind: 'stretch', mode })}
                />
              </div>
            ))}
          </div>
        </ErrorBoundary>
        <div className="grid gap-x-10 2xl:grid-cols-2">
          <Section id="t-late" title="How well it keeps to its timetable">
            <div className="mt-3"><Group label="Day" value={day} onChange={v => setDay(v as Day)} options={DAYS} /></div>
            <ErrorBoundary label={BOUNDARY('How well it keeps to its timetable')}><Late data={bandData} dir={dir} day={day} band={band} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
          </Section>
          <Section id="t-runtime" title="Run time">
            <ErrorBoundary label={BOUNDARY('Run time')}><RunTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
          </Section>
        </div>
        <Section id="t-buildup" title="Where delays build up">
          <ErrorBoundary label={BOUNDARY('Where delays build up')}><Buildup v3={v3} data={bandData} dir={dir} uncertain={uncertain} /></ErrorBoundary>
        </Section>
        <Section id="t-wait" title="Extra wait">
          <ErrorBoundary label={BOUNDARY('Extra wait')}><ExtraWait v3={v3} band={band} dir={dir} /></ErrorBoundary>
        </Section>
        <Section id="t-bunching" title="Where bunching forms">
          <ErrorBoundary label={BOUNDARY('Where bunching forms')}><Bunching v3={v3} dir={dir} band={band} /></ErrorBoundary>
        </Section>
        <div className="grid gap-x-10 2xl:grid-cols-2">
          <Section id="t-delivered" title="Service delivered">
            <ErrorBoundary label={BOUNDARY('Service delivered')}><Delivered v3={v3} dir={dir} /></ErrorBoundary>
          </Section>
          <Section id="t-stops" title="Stops with the most delay">
            <ErrorBoundary label={BOUNDARY('Stops with the most delay')}>
              <WorstStops v3={v3} data={bandData} dir={dir} uncertain={uncertain} onPick={pickStop} canPick={(d, id) => directionStopsById(v3, d, band, uncertain).has(id)} />
            </ErrorBoundary>
          </Section>
        </div>
        <ErrorBoundary label="How this is measured could not be drawn."><Method data={data} /></ErrorBoundary>
      </div>
      <div className="min-h-0 overflow-y-auto border-t border-[var(--border-primary)] p-4 lg:border-l lg:border-t-0">
        <DetailPanel v3={v3} band={band} sel={shown} stops={stops} data={bandData} />
      </div>
    </div>
  );
}

/** The Live planner screen: a fixed shell with every route in a list on the left, the filters on top, and the picked route (strip, charts, stops) with a panel for the picked stop or stretch. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [route, setRoute] = useState<string | null>(() => readParam('route'));
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [day, setDay] = useState<Day>(() => { const d = readParam('day'); return d === 'weekday' || d === 'weekend' ? d : 'all'; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [sel, setSel] = useState<Selection | null>(() => {
    const stop = readParam('stop'), d = Number(readParam('sdir') ?? readParam('dir') ?? 0);
    return stop ? { dir: d, kind: 'stop', stopId: stop } : null;
  });
  const summary = state.kind === 'done' && state.data.status === 'ready' ? state.data.summary : null;
  // With no route in the address, the tool opens on the top of the list.
  const worstFirst = useMemo(() => { if (!summary) return null; const o = orderRoutes(summary); return (o.worse[0] ?? o.rest[0])?.r.route ?? null; }, [summary]);
  const current = route ?? worstFirst ?? null;
  useEffect(() => {
    syncUrlParams({
      view: null, route: route, dir: dir == null ? null : String(dir), day: day === 'all' ? null : day, band: band === 'all' ? null : band,
      stop: sel?.kind === 'stop' ? sel.stopId : null, sdir: sel?.kind === 'stop' ? String(sel.dir) : null,
    });
  }, [route, dir, day, band, sel]);
  useEffect(() => { applySeoToDocument(document, { title: liveReportTitle(agency.toUpperCase()), description: '', canonicalUrl: window.location.href, noindex: true, matchedPath: window.location.pathname }); }, [agency]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const pickRoute = (r: string) => { setRoute(r); setSel(null); };
  const shell = (body: ReactNode) => <main className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">{body}</main>;
  if (state.kind === 'loading') return shell(<p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()}…</p>);
  if (state.kind === 'error') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>);
  if (state.data.status !== 'ready') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.data.status === 'no_analysis' ? devOnly(state.data.reason) : state.data.reason}</p>);
  const s = state.data.summary;
  return shell(
    <>
      <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[var(--border-primary)] px-6 py-3">
        <a href={`/apps/live/${agency}`} className="text-base font-black hover:underline">{agency.toUpperCase()}</a>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2" role="group" aria-label="Filters">
          <DirectionFilter agency={agency} route={current} dir={dir} setDir={setDir} />
          <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-b border-[var(--border-primary)] lg:border-b-0 lg:border-r">
          <div className="max-h-[30vh] min-h-0 overflow-y-auto lg:max-h-none lg:flex-1"><RouteList s={s} route={current ?? ''} onPick={pickRoute} /></div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          {current ? <RouteView agency={agency} route={current} band={band} dir={dir} day={day} setDay={setDay} sel={sel} setSel={setSel} /> : null}
        </div>
      </div>
    </>,
  );
}

/** The direction pills for the picked route (from its analysis); nothing until it has loaded. */
function DirectionFilter({ agency, route, dir, setDir }: { agency: string; route: string | null; dir: number | null; setDir: (d: number | null) => void }) {
  const state = useLiveDashboard(route ? agency : null, route);
  const labels = state.kind === 'done' && state.data.status === 'ready' ? state.data.v3.directionLabels : null;
  if (!labels) return null;
  const ids = Object.keys(labels).map(Number).sort((a, b) => a - b);
  return <Group label="Direction" value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))} options={[['both', 'Both directions'], ...ids.map(d => [String(d), labels[String(d)]] as const)]} />;
}
