import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';
import { delayAmount, headwayAmount } from '../shared/headwayText';
import type { AgencySummary } from '../shared/liveAgency';
import type { DashboardBand, DashboardBandData, LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { liveDashboardDataUrl } from './lib/liveReportData';
import HourSpark from './components/charts/HourSpark';
import RunTimeChart, { runTimeScale } from './components/charts/RunTimeChart';
import LegendItem from './components/ui/LegendItem';
import { TILE } from './pageStyles';
import { liveChartHours } from './utils/sparklinePeriods';
import { lateCount, lateHourLine } from '../shared/liveWording';
import { periodKeyForHour } from '../shared/config';
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
import { delayInterpolated, delayText, type RouteStripStop } from './components/Live/routeStripModel';
import SortableDataTable from './components/ui/SortableDataTable';
import { RouteNameCell } from './pageParts';
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

/** Late share by hour over the whole 5am–4am day, with the chosen time of day shaded, beside the route's late share. */
function LateByHour({ v3, band }: { v3: LiveV3; band: DashboardBand }) {
  const block = v3.bands.all.adherence.timepoints.all;
  const c = block.overall;
  if (!c || c.n === 0) return null;
  const hours = block.byHour.filter(h => h.n > 0).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));
  const max = Math.max(0.1, ...hours.filter(h => h.n >= 30).map(h => h.value));
  return (
    <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className={TILE}>
        <div className="text-3xl font-bold tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()}</div>
      </div>
      <div className="min-w-0">
        <HourSpark
          departures height={96} values={hours} scale={{ min: 0, max: Math.ceil(max * 10) / 10 }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
          hours={liveChartHours(h => hours.some(x => x.hour === h && x.n >= 30))}
          shade={band === 'all' ? undefined : h => periodKeyForHour(h) === band}
          hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)}
          ariaLabel={`Share of departures late by hour of the day, ${pct(c.lateShare)} late overall.`}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <LegendItem color="var(--status-negative-text)">Late %</LegendItem>
          <LegendItem kind="line" color="var(--text-dim)">Departures</LegendItem>
        </div>
      </div>
    </div>
  );
}

/** Run time by the hour a trip starts, one chart per direction over the whole day with the chosen time of day shaded. */
function RunTimeByHour({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number }) {
  const rt = v3.runningTime;
  const hours = (rt?.byHour[String(dir)] ?? []).filter(h => h.n >= 1);
  if (!rt || hours.length < 2) return null;
  const f = rt.bands[band]?.[String(dir)];
  return (
    <div className="min-w-0">
      {f && <div className="text-sm text-[var(--text-muted)]">Usually {Math.round(f.typicalMin)} min · timetable {Math.round(f.scheduledMin)} · 1 in 10 over {Math.round(f.p90Min)}</div>}
      <RunTimeChart hours={hours} scale={runTimeScale([hours])} height={180} caption={false}
        shade={band === 'all' ? undefined : h => periodKeyForHour(h) === band}
        ariaLabel={`${v3.directionLabels[String(dir)]}: run time against the schedule by the hour the trip starts.`} />
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

type Tab = 'stops' | 'stretches' | 'hours' | 'strings';
const TABS: ReadonlyArray<readonly [Tab, string]> = [['stops', 'Stops'], ['stretches', 'Stretches'], ['hours', 'By hour'], ['strings', 'String line']];
const NET_TABS: ReadonlyArray<readonly ['routes' | 'hours', string]> = [['routes', 'Routes'], ['hours', 'By hour']];

/** A pane's tab bar. */
function TabBar<K extends string>({ tabs, value, onChange }: { tabs: ReadonlyArray<readonly [K, string]>; value: K; onChange: (k: K) => void }) {
  return (
    <div className="shrink-0 border-b border-[var(--border-primary)] px-4 py-2">
      <Group label="Pane" value={value} onChange={v => onChange(v as K)} options={tabs} />
    </div>
  );
}

const SELECTED_ROW = 'bg-[var(--accent-selected-bg)]';

/** Every stop of the direction with its figures; a row picks the stop on the map. */
function StopsTable({ v3, band, dir, stops, pick, onRow }: { v3: LiveV3; band: DashboardBand; dir: number; stops: ReturnType<typeof directionStopsById>; pick: MapPick | null; onRow: (stop: RouteStripStop) => void }) {
  const extra = useMemo(() => new Map((v3.extraWait?.[band] ?? []).filter(x => x.directionId === dir).map(x => [x.stopId, x.extraWaitMin])), [v3, band, dir]);
  const rows = [...stops.values()];
  return (
    <SortableDataTable
      caption="Stops"
      rows={rows}
      rowKey={s => s.stopId}
      rowClassName={s => (pick?.kind === 'stop' && pick.stopId === s.stopId ? SELECTED_ROW : '')}
      columns={[
        { key: 'stop', header: 'Stop', rowHeader: true, width: 13, className: 'font-normal', cell: s => <button type="button" onClick={() => onRow(s)} className="text-left font-[inherit] hover:underline">{s.name}</button> },
        { key: 'delay', header: 'Typical delay', width: 6.5, worst: s => (s.n > 0 && !delayInterpolated(s) ? s.delayMin : null), cell: s => (s.n > 0 && s.delayMin != null && !delayInterpolated(s) ? delayText(s.delayMin) : '–') },
        { key: 'late', header: 'Late', width: 4.5, worst: s => s.lateShare, cell: s => (s.lateShare != null && s.n > 0 ? pct(s.lateShare) : '–') },
        { key: 'bunched', header: 'Too close together', width: 7.5, worst: s => s.bunchedShare, cell: s => (s.bunchedShare != null ? pct(s.bunchedShare) : '–') },
        { key: 'long', header: 'Too far apart', width: 6, worst: s => s.gappedShare, cell: s => (s.gappedShare != null ? pct(s.gappedShare) : '–') },
        { key: 'wait', header: 'Extra wait', width: 5.5, worst: s => extra.get(s.stopId) ?? null, cell: s => (extra.has(s.stopId) ? delayAmount(Math.max(0, extra.get(s.stopId)!)) : '–') },
      ]}
    />
  );
}

/** Every stretch between consecutive stops with the time it adds; a row picks the segment on the map. */
function StretchesTable({ data, dir, stops, pick, onRow }: { data: DashboardBandData; dir: number; stops: ReturnType<typeof directionStopsById>; pick: MapPick | null; onRow: (from: string, to: string) => void }) {
  const rows = (data.buildup.find(b => b.directionId === dir)?.stretches ?? []).filter(x => x.n > 0);
  const key = (x: { fromStopId: string; toStopId: string }) => `${x.fromStopId}>${x.toStopId}`;
  const name = (id: string, fallback: string) => shortStopName(stops.get(id)?.name ?? fallback);
  return (
    <SortableDataTable
      caption="Stretches"
      rows={rows}
      rowKey={key}
      rowClassName={x => (pick?.kind === 'segment' && pick.fromStopId === x.fromStopId && pick.toStopId === x.toStopId ? SELECTED_ROW : '')}
      columns={[
        { key: 'stretch', header: 'Stretch', rowHeader: true, width: 17, className: 'font-normal', cell: x => <button type="button" onClick={() => onRow(x.fromStopId, x.toStopId)} className="text-left font-[inherit] hover:underline">{name(x.fromStopId, x.fromName)} to {name(x.toStopId, x.toName)}</button> },
        { key: 'added', header: 'Typical added', width: 7, worst: x => x.medianAddedMin, cell: x => mins(x.medianAddedMin) },
        { key: 'grows', header: 'Trips where it grows', width: 9, worst: x => x.growShare, cell: x => `${pct(x.growShare)} of ${x.n.toLocaleString()}` },
      ]}
    />
  );
}

/** The charts by hour for the route: late share, then run time for the picked direction. */
function HoursPane({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number }) {
  return (
    <div className="space-y-6">
      <div><h2 className="pb-2 text-sm font-bold">How well it keeps to its timetable</h2><ErrorBoundary label="This chart could not be drawn."><LateByHour v3={v3} band={band} /></ErrorBoundary></div>
      <div><h2 className="pb-2 text-sm font-bold">Run time</h2><ErrorBoundary label="This chart could not be drawn."><RunTimeByHour v3={v3} band={band} dir={dir} /></ErrorBoundary></div>
    </div>
  );
}

/** The picked route, split: the map on the left coloured by the measure, a tabbed data pane on the right. Picking is linked both ways. */
function Canvas({ data, v3, agency, tab, setTab, route, dir, band, measure, pick, setPick }: {
  data: Extract<ReturnType<typeof useLiveDashboard>, { kind: 'done' }>['data'] & { status: 'ready' }; v3: LiveV3; agency: string; tab: Tab; setTab: (t: Tab) => void; route: string; dir: number;
  band: DashboardBand; measure: MapMeasure; pick: MapPick | null; setPick: (p: MapPick | null) => void;
}) {
  const bandData = v3.bands[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  const model = useMemo(() => routeMapModel(v3, dir, band, measure), [v3, dir, band, measure]);
  const stops = useMemo(() => directionStopsById(v3, dir, band, uncertain), [v3, dir, band, uncertain]);
  const [centerOn, setCenterOn] = useState<{ lonLat: [number, number]; k: number } | null>(null);
  const pane = useRef<HTMLDivElement | null>(null);
  const centre = (lonLat: [number, number] | undefined) => { if (lonLat) setCenterOn(c => ({ lonLat, k: (c?.k ?? 0) + 1 })); };
  // A pick made on the map scrolls its row into view.
  useEffect(() => {
    if (!pick) return;
    const k = pick.kind === 'stop' ? pick.stopId : `${pick.fromStopId}>${pick.toStopId}`;
    pane.current?.querySelector(`[data-row="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [pick, tab]);
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[45%_minmax(0,1fr)]">
      <div className="relative min-h-0 border-[var(--border-primary)] lg:border-r">
        <RouteMap model={model} measure={measure} selected={pick} onPick={p => setPick(p)} centerOn={centerOn} frameKey={`${route}-${dir}`} />
        <Key measure={measure} />
        {data.note && <p className="absolute bottom-3 left-3 right-3 z-10 m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{data.note}</p>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <TabBar tabs={TABS} value={tab} onChange={setTab} />
        <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === 'stops' && <StopsTable v3={v3} band={band} dir={dir} stops={stops} pick={pick} onRow={s => { setPick({ kind: 'stop', stopId: s.stopId }); centre(model.stops.find(x => x.stopId === s.stopId)?.lonLat); }} />}
          {tab === 'stretches' && <StretchesTable data={bandData} dir={dir} stops={stops} pick={pick} onRow={(f, t) => { setPick({ kind: 'segment', fromStopId: f, toStopId: t }); const seg = model.segments.find(x => x.fromStopId === f && x.toStopId === t); centre(seg?.coordinates[Math.floor(seg.coordinates.length / 2)]); }} />}
          {tab === 'hours' && <HoursPane v3={v3} band={band} dir={dir} />}
          {tab === 'strings' && <StringsPane key={route} agency={agency} route={route} v3={v3} dir={dir} band={band} />}
        </div>
      </div>
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

/** The network's routes, with the Routes table's columns; hovering a row lights its route on the map, a click opens it. */
function RoutesPane({ s, onRoute, onHover }: { s: AgencySummary; onRoute: (r: string) => void; onHover: (r: string | null) => void }) {
  const pctS = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  const signed = (x: number | null) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`);
  return (
    <div onPointerLeave={() => onHover(null)}>
      <SortableDataTable
        caption="Routes"
        defaultSort="late"
        rows={s.routes}
        rowKey={r => r.route}
        columns={[
          { key: 'route', header: 'Route', rowHeader: true, width: 13, className: 'font-normal', cell: r => <button type="button" onClick={() => onRoute(r.route)} onPointerEnter={() => onHover(r.route)} className="text-left font-[inherit] hover:underline"><RouteNameCell shortName={r.route} longName={r.longName} mode={r.mode ?? 3} agencyName={s.agency.toUpperCase()} /></button> },
          { key: 'late', header: 'Late', width: 4.5, worst: r => r.lateShare, cell: r => pctS(r.lateShare) },
          { key: 'lastWeek', header: 'Last week', width: 6, className: 'text-[var(--text-muted)]', cell: r => pctS(r.lateLastWeek) },
          { key: 'runTime', header: 'Run time', width: 6, worst: r => r.runTimeOver, cell: r => signed(r.runTimeOver) },
          { key: 'bunching', header: 'Bunching', width: 6, worst: r => r.bunchingShare, cell: r => pctS(r.bunchingShare) },
          { key: 'delivered', header: 'Delivered', width: 6, worst: r => (r.deliveredShare == null ? null : 1 - r.deliveredShare), cell: r => (r.deliveredShare == null ? '–' : `${(Math.floor(r.deliveredShare * 1000) / 10).toString()}%`) },
        ]}
      />
    </div>
  );
}

/** The home screen: every analysed route on the left map, coloured by the measure; the routes table on the right. A click on either opens the route. */
function NetworkCanvas({ agency, s, band, measure, onRoute }: { agency: string; s: AgencySummary; band: DashboardBand; measure: MapMeasure; onRoute: (route: string) => void }) {
  const routes = useMemo(() => s.routes.map(r => r.route), [s]);
  const data = useNetworkData(agency, routes);
  const [tab, setTab] = useState<'routes' | 'hours'>('routes');
  const [hl, setHl] = useState<string | null>(null);
  const model: RouteMapModel = useMemo(() => {
    const segments: MapSegment[] = [];
    for (const [route, v3] of data) {
      const ids = Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b);
      ids.forEach((d, k) => { for (const seg of routeMapModel(v3, d, band, measure).segments) segments.push({ ...seg, route, label: route, offset: ids.length > 1 ? (k === 0 ? 2.5 : -2.5) : 0 }); });
    }
    return { directionId: 0, segments, stops: [] };
  }, [data, band, measure]);
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[45%_minmax(0,1fr)]">
      <div className="relative min-h-0 border-[var(--border-primary)] lg:border-r">
        <RouteMap model={model} measure={measure} selected={null} highlightRoute={hl} onPick={p => { if (p?.kind === 'segment' && p.route) onRoute(p.route); }} frameKey={`network-${data.size === routes.length ? 'all' : 'loading'}`} />
        <Key measure={measure} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <TabBar tabs={NET_TABS} value={tab} onChange={setTab} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === 'routes' ? <RoutesPane s={s} onRoute={onRoute} onHover={setHl} /> : <div><h2 className="pb-2 text-sm font-bold">How well it keeps to its timetable</h2><NetworkLate s={s} /></div>}
        </div>
      </div>
    </div>
  );
}

function RouteCanvas({ agency, route, tab, setTab, dir, setDir, band, measure, pick, setPick }: {
  agency: string; tab: Tab; setTab: (t: Tab) => void; route: string; dir: number | null; setDir: (d: number) => void; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; setPick: (p: MapPick | null) => void;
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
      {ids.length > 1 && <DirectionBar ids={ids} labels={v3.directionLabels} dir={shown} setDir={setDir} />}
      <Canvas data={data} v3={v3} agency={agency} tab={tab} setTab={setTab} route={route} dir={shown} band={band} measure={measure} pick={pick} setPick={setPick} />
    </>
  );
}

/** The direction switch sits above the split, under the top bar, because its options belong to the picked route. */
function DirectionBar({ ids, labels, dir, setDir }: { ids: number[]; labels: Record<string, string>; dir: number; setDir: (d: number) => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2">
      <Group label="Direction" value={String(dir)} onChange={v => setDir(Number(v))} options={ids.map(d => [String(d), labels[String(d)]] as const)} />
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
  const [tab, setTab] = useState<Tab>(() => { const t = readParam('tab'); return TABS.some(([k]) => k === t) ? (t as Tab) : 'stops'; });
  const [pick, setPick] = useState<MapPick | null>(() => {
    const stop = readParam('stop'), seg = readParam('seg');
    if (stop) return { kind: 'stop', stopId: stop };
    const [f, t] = (seg ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  const summary: AgencySummary | null = state.kind === 'done' && state.data.status === 'ready' ? state.data.summary : null;
  const current = route;
  useEffect(() => {
    syncUrlParams({
      view: null, tab: tab === 'stops' ? null : tab, route, dir: dir == null ? null : String(dir), band: band === 'all' ? null : band, measure: measure === 'late' ? null : measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, seg: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    });
  }, [route, dir, band, measure, pick, tab]);
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
        <button type="button" onClick={() => { setRoute(null); setPick(null); }} className="text-sm font-bold hover:underline">{agency.toUpperCase()}</button>
        <RoutePicker s={s} route={current} onPick={r => { setRoute(r); setPick(null); }} />
        <Group label="Measure" value={measure} onChange={v => setMeasure(v as MapMeasure)} options={MEASURES} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </header>
      {!current && <NetworkCanvas agency={agency} s={s} band={band} measure={measure} onRoute={r => { setRoute(r); setPick(null); }} />}
      {current && <RouteCanvas agency={agency} tab={tab} setTab={setTab} route={current} dir={dir} setDir={d => { setDir(d); setPick(null); }} band={band} measure={measure} pick={pick} setPick={setPick} />}
    </>,
  );
}
