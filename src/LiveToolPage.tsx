import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';
import { delayAmount, headwayAmount } from '../shared/headwayText';
import type { AgencySummary } from '../shared/liveAgency';
import type { DashboardBand, DashboardBandData, LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { liveDashboardDataUrl } from './lib/liveReportData';
import HourSpark from './components/charts/HourSpark';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasBrand from './components/AtlasBrand';
import RoutePicker from './components/Live/RoutePicker';
import RouteMap, { type MapPick } from './components/Live/RouteMap';
import { directionStopsById } from './components/Live/DirectionStrip';
import { MAP_STEP_LIMITS, MEASURES, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from './components/Live/routeMapModel';
import { STEP_LABELS } from './components/Live/routeStripModel';
import { stopDetail, type RouteStripStop } from './components/Live/routeStripModel';
import StringLine, { useStrings } from './components/Live/StringLine';
import Pill from './components/ui/Pill';
import { dateRangeText } from '../shared/liveDashboard';
import { BANDS, Block, DetailPanel, Fact, Group, Late, Panel, RunTime, type Selection } from './LiveExplorePage';
import { withNiceNames } from './LiveRoutePage';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mins = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 10) / 10} min`.replace('-', '−');
const readParam = (key: string) => new URLSearchParams(window.location.search).get(key);

/** The three step labels of a measure's key: the bunching key the strips already use, and the same shape for the others. */
function stepLabels(measure: MapMeasure): [string, string, string] {
  if (measure === 'bunching') return [...STEP_LABELS.bunching] as [string, string, string];
  const [a, b] = MAP_STEP_LIMITS[measure];
  if (measure === 'late') return [`Under ${pct(a)}`, `${pct(a)}–${pct(b)}`, `${pct(b)} or more`];
  const m = (x: number) => `${x} min`;
  return [`Under ${m(a)}`, `${a}–${m(b)}`, `${m(b)} or more`];
}
const STEP_VAR = (measure: MapMeasure, step: number) => `var(--strip-${measure === 'bunching' ? 'bunching' : 'delay'}-${step})`;

function Key({ measure }: { measure: MapMeasure }) {
  const labels = stepLabels(measure);
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-2 text-xs shadow-sm">
      <div className="font-bold text-[var(--text-secondary)]">{MEASURES.find(([k]) => k === measure)![1]}</div>
      <ul className="m-0 mt-1 flex flex-col gap-1 p-0">
        {labels.map((l, i) => (
          <li key={l} className="flex list-none items-center gap-2 text-[var(--text-legend)]"><span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-full" style={{ background: STEP_VAR(measure, i) }} />{l}</li>
        ))}
        <li className="flex list-none items-center gap-2 text-[var(--text-legend)]"><span aria-hidden="true" className="inline-block h-2.5 w-5 rounded-full" style={{ background: 'var(--strip-delay-0)', opacity: 0.45 }} />Not measured</li>
      </ul>
    </div>
  );
}

/** The card for a picked stop: its name and the trimmed figures the strip's hover shows, then its extra wait where it has one. Compact, no scroll. */
function StopCard({ v3, band, dir, stop }: { v3: LiveV3; band: DashboardBand; dir: number; stop: RouteStripStop }) {
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === stop.stopId);
  const d = stopDetail(stop);
  return (
    <div className="space-y-0.5 p-3 text-xs">
      <div className="text-sm font-bold leading-snug">{d.name}</div>
      {d.lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
      {extra && <div className="text-[var(--text-secondary)]">Extra wait {delayAmount(Math.max(0, extra.extraWaitMin))}</div>}
    </div>
  );
}

/** The card for a picked segment: only the segment (its name, the time it adds, how often delay grows across it), never its start stop. */
function SegmentCard({ data, dir, fromStopId, toStopId, stops }: { data: DashboardBandData; dir: number; fromStopId: string; toStopId: string; stops: ReturnType<typeof directionStopsById> }) {
  const stretch = data.buildup.find(x => x.directionId === dir)?.stretches.find(x => x.fromStopId === fromStopId && x.toStopId === toStopId);
  return (
    <div className="space-y-0.5 p-3 text-xs">
      <div className="text-sm font-bold leading-snug">{shortStopName(stops.get(fromStopId)?.name ?? fromStopId)} to {shortStopName(stops.get(toStopId)?.name ?? toStopId)}</div>
      {stretch && stretch.n > 0 && (
        <>
          <div className="text-[var(--text-secondary)]">Typical added {mins(stretch.medianAddedMin)}</div>
          <div className="text-[var(--text-secondary)]">Trips where it grows {pct(stretch.growShare)} of {stretch.n.toLocaleString()}</div>
        </>
      )}
    </div>
  );
}

/** The string-line view: one service day of one direction, over the chosen time of day. The days are the last three of the analysis window. */
function StringsPane({ agency, route, v3, dir, band }: { agency: string; route: string; v3: LiveV3; dir: number; band: DashboardBand }) {
  const dates = v3.window.dates.slice(-3);
  const [date, setDate] = useState<string | null>(dates[dates.length - 1] ?? null);
  const state = useStrings(agency, route, date);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day">
        {dates.map(d => <Pill key={d} size="segment" selected={d === date} onClick={() => setDate(d)}>{dateRangeText(d, d)}</Pill>)}
      </div>
      <div className="mt-4">{state.kind === 'ready' ? <StringLine data={state.data} directionId={dir} band={band} /> : null}</div>
    </div>
  );
}

function Canvas({ data, v3, agency, view, route, dir, band, measure, pick, anchor, setPick }: {
  data: Extract<ReturnType<typeof useLiveDashboard>, { kind: 'done' }>['data'] & { status: 'ready' }; v3: LiveV3; agency: string; view: 'map' | 'strings'; route: string; dir: number; band: DashboardBand; measure: MapMeasure;
  pick: MapPick | null; anchor: [number, number] | null; setPick: (p: MapPick | null, at: [number, number] | null) => void;
}) {
  const bandData = v3.bands[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  const model = useMemo(() => routeMapModel(v3, dir, band, measure), [v3, dir, band, measure]);
  const stops = useMemo(() => directionStopsById(v3, dir, band, uncertain), [v3, dir, band, uncertain]);
  const hasChart = measure === 'late' || measure === 'runTime';
  const picked = pick?.kind === 'stop' ? stops.get(pick.stopId) : undefined;
  const card = pick?.kind === 'segment' ? (
    <SegmentCard data={bandData} dir={dir} fromStopId={pick.fromStopId} toStopId={pick.toStopId} stops={stops} />
  ) : picked ? <StopCard v3={v3} band={band} dir={dir} stop={picked} /> : null;
  if (view === 'strings') return <StringsPane key={`${route}`} agency={agency} route={route} v3={v3} dir={dir} band={band} />;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <RouteMap model={model} measure={measure} selected={pick} onPick={(p, at) => setPick(p, at)} anchor={anchor ?? (pick?.kind === 'stop' ? model.stops.find(x => x.stopId === pick.stopId)?.lonLat ?? null : null)} card={card} frameKey={`${route}-${dir}`} />
        <Key measure={measure} />
        {data.note && <p className="absolute bottom-3 left-3 right-3 z-10 m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{data.note}</p>}
      </div>
      {hasChart && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-[var(--border-primary)] bg-[var(--bg-app)] px-6 pb-4">
          <ErrorBoundary label="This chart could not be drawn.">
            {measure === 'late' ? <Late data={bandData} dir={dir} day="all" band={band} lateMin={v3.thresholds.lateAtOrAboveMin} /> : <RunTime v3={v3} band={band} dir={dir} />}
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

/** Every analysed route's analysis, fetched side by side; a route shows up on the network map as soon as its file arrives. */
function useNetworkData(agency: string, routes: readonly string[]): Map<string, LiveV3> {
  const [data, setData] = useState<Map<string, LiveV3>>(new Map());
  const key = routes.join(',');
  useEffect(() => {
    let live = true;
    setData(new Map());
    for (const r of routes) {
      fetch(liveDashboardDataUrl(agency, r))
        .then(res => res.json())
        .then((body: { status?: string; v3?: LiveV3 }) => { if (live && body.status === 'ready' && body.v3) setData(prev => new Map(prev).set(r, body.v3!)); })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [agency, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

/** The network's late share by hour, from each route's own by-hour shares weighted by their departures. */
function NetworkLate({ s }: { s: AgencySummary }) {
  const values = Array.from({ length: 24 }, (_, hour) => {
    let n = 0, late = 0;
    for (const r of s.routes) { const h = r.lateByHour.find(x => x.hour === hour); if (h) { n += h.n; late += h.value * h.n; } }
    return { hour, value: n ? late / n : 0, n };
  }).filter(x => x.n > 0);
  if (!values.length) return null;
  const max = Math.max(0.1, ...values.filter(v => v.n >= 30).map(v => v.value));
  return (
    <div className="px-6 pb-4 pt-4">
      <HourSpark departures values={values} scale={{ min: 0, max: Math.ceil(max * 10) / 10 }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late" ariaLabel="Share of departures late by hour of the day, across every route." />
    </div>
  );
}

/** The home screen: every analysed route on one map, coloured by the chosen measure and time of day. Clicking a route opens it. */
function NetworkCanvas({ agency, s, band, measure, onRoute }: { agency: string; s: AgencySummary; band: DashboardBand; measure: MapMeasure; onRoute: (route: string) => void }) {
  const routes = useMemo(() => s.routes.map(r => r.route), [s]);
  const data = useNetworkData(agency, routes);
  const model: RouteMapModel = useMemo(() => {
    const segments: MapSegment[] = [];
    for (const [route, v3] of data) {
      const ids = Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b);
      ids.forEach((d, k) => { for (const seg of routeMapModel(v3, d, band, measure).segments) segments.push({ ...seg, route, offset: ids.length > 1 ? (k === 0 ? 2.5 : -2.5) : 0 }); });
    }
    return { directionId: 0, segments, stops: [] };
  }, [data, band, measure]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <RouteMap model={model} measure={measure} selected={null} onPick={p => { if (p?.kind === 'segment' && p.route) onRoute(p.route); }} frameKey={`network-${data.size === routes.length ? 'all' : 'loading'}`} />
        <Key measure={measure} />
      </div>
      {measure === 'late' && <div className="shrink-0 border-t border-[var(--border-primary)] bg-[var(--bg-app)]"><NetworkLate s={s} /></div>}
    </div>
  );
}

function RouteCanvas({ agency, route, view, setView, dir, setDir, band, measure, pick, anchor, setPick }: {
  agency: string; view: 'map' | 'strings'; setView: (v: 'map' | 'strings') => void; route: string; dir: number | null; setDir: (d: number) => void; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; anchor: [number, number] | null; setPick: (p: MapPick | null, at: [number, number] | null) => void;
}) {
  const state = useLiveDashboard(agency, route);
  if (state.kind === 'loading') return <p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()} {route}…</p>;
  if (state.kind === 'error') return <p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>;
  const data = state.data;
  if (data.status !== 'ready') return <p className="p-6 text-sm text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>;
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const ids = Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b);
  const shown = dir != null && ids.includes(dir) ? dir : ids[0];
  return (
    <>
      <DirectionBar ids={ids} labels={v3.directionLabels} dir={shown} setDir={setDir} view={view} setView={setView} />
      <Canvas data={data} v3={v3} agency={agency} view={view} route={route} dir={shown} band={band} measure={measure} pick={pick} anchor={anchor} setPick={setPick} />
    </>
  );
}

/** The direction switch sits above the map, under the top bar, because its options belong to the picked route. */
function DirectionBar({ ids, labels, dir, setDir, view, setView }: { ids: number[]; labels: Record<string, string>; dir: number; setDir: (d: number) => void; view: 'map' | 'strings'; setView: (v: 'map' | 'strings') => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] px-4 py-2">
      {ids.length > 1 ? <Group label="Direction" value={String(dir)} onChange={v => setDir(Number(v))} options={ids.map(d => [String(d), labels[String(d)]] as const)} /> : <span />}
      <Group label="View" value={view} onChange={v => setView(v as 'map' | 'strings')} options={[['map', 'Map'], ['strings', 'String line']]} />
    </div>
  );
}

/** The Live planner: the picked route on the map, each segment coloured by the chosen measure; a panel for the picked segment or stop. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [route, setRoute] = useState<string | null>(() => readParam('route'));
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [measure, setMeasure] = useState<MapMeasure>(() => { const m = readParam('measure'); return MEASURES.some(([k]) => k === m) ? (m as MapMeasure) : 'late'; });
  const [view, setView] = useState<'map' | 'strings'>(() => (readParam('view') === 'strings' ? 'strings' : 'map'));
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const setPick = (p: MapPick | null, at: [number, number] | null) => { setPickRaw(p); setAnchor(at); };
  const [pick, setPickRaw] = useState<MapPick | null>(() => {
    const stop = readParam('stop'), seg = readParam('seg');
    if (stop) return { kind: 'stop', stopId: stop };
    const [f, t] = (seg ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  const summary: AgencySummary | null = state.kind === 'done' && state.data.status === 'ready' ? state.data.summary : null;
  const current = route;
  useEffect(() => {
    syncUrlParams({
      view: view === 'strings' ? 'strings' : null, route, dir: dir == null ? null : String(dir), band: band === 'all' ? null : band, measure: measure === 'late' ? null : measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, seg: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    });
  }, [route, dir, band, measure, pick, view]);
  useEffect(() => { applySeoToDocument(document, { title: liveReportTitle(agency.toUpperCase()), description: '', canonicalUrl: window.location.href, noindex: true, matchedPath: window.location.pathname }); }, [agency]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const shell = (body: ReactNode) => <main className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">{body}</main>;
  if (state.kind === 'loading') return shell(<p className="p-6 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {agency.toUpperCase()}…</p>);
  if (state.kind === 'error') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.reason}</p>);
  if (state.data.status !== 'ready') return shell(<p className="p-6 text-sm text-[var(--text-muted)]">{state.data.status === 'no_analysis' ? devOnly(state.data.reason) : state.data.reason}</p>);
  const s = state.data.summary;
  return shell(
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border-primary)] bg-[var(--bg-header)] px-4 py-2">
        <a href="/" aria-label="Atlas by Civic Minds"><AtlasBrand /></a>
        <button type="button" onClick={() => { setRoute(null); setPick(null, null); }} className="text-sm font-bold hover:underline">{agency.toUpperCase()}</button>
        <RoutePicker s={s} route={current} onPick={r => { setRoute(r); setPick(null, null); }} />
        <Group label="Measure" value={measure} onChange={v => setMeasure(v as MapMeasure)} options={MEASURES} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </header>
      {!current && <NetworkCanvas agency={agency} s={s} band={band} measure={measure} onRoute={r => { setRoute(r); setPick(null, null); }} />}
      {current && <RouteCanvas agency={agency} view={view} setView={setView} route={current} dir={dir} setDir={d => { setDir(d); setPick(null, null); }} band={band} measure={measure} pick={pick} anchor={anchor} setPick={setPick} />}
    </>,
  );
}
