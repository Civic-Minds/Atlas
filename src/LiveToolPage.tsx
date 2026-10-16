import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';
import { delayAmount } from '../shared/headwayText';
import type { AgencySummary } from '../shared/liveAgency';
import { rankStops, weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import { titleCase } from './utils/format';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { kpiTiles } from './utils/liveKpi';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasBrand from './components/AtlasBrand';
import RoutePicker from './components/Live/RoutePicker';
import RouteMap, { type MapPick } from './components/Live/RouteMap';
import { directionStopsById } from './components/Live/DirectionStrip';
import { MAP_STEP_LIMITS, MEASURES, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from './components/Live/routeMapModel';
import { STEP_LABELS, stopDetail, type RouteStripStop } from './components/Live/routeStripModel';
import Widget from './components/Live/tool/Widget';
import WidgetPanel, { type PanelWidget } from './components/Live/tool/WidgetPanel';
import OverviewList from './components/Live/tool/OverviewList';
import LateByHourWidget from './components/Live/tool/LateByHourWidget';
import ProblemsWidget from './components/Live/tool/ProblemsWidget';
import StopHourWidget from './components/Live/tool/StopHourWidget';
import StringLineView from './components/Live/tool/StringLineView';
import RunTimeWidget from './components/Live/tool/RunTimeWidget';
import useNetworkData from './components/Live/tool/useNetworkData';
import { KpiTile } from './LiveDashboardView';
import { BANDS, Group } from './LiveExplorePage';
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


/** The lines of a stop's card: the trimmed figures the strip's hover shows, then its extra wait where it has one. */
function stopLines(v3: LiveV3, band: DashboardBand, dir: number, stop: RouteStripStop): string[] {
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === stop.stopId);
  return [...stopDetail(stop).lines, ...(extra ? [`Extra wait ${delayAmount(Math.max(0, extra.extraWaitMin))}`] : [])];
}

/** The lines of a segment's card: only the segment, never its start stop. */
function segmentLines(data: DashboardBandData, dir: number, fromStopId: string, toStopId: string): string[] {
  const x = data.buildup.find(b => b.directionId === dir)?.stretches.find(t => t.fromStopId === fromStopId && t.toStopId === toStopId);
  return x && x.n > 0 ? [`Typical added ${mins(x.medianAddedMin)}`, `Trips where it grows ${pct(x.growShare)} of ${x.n.toLocaleString()}`] : [];
}

/** The compact card shown on the map at the picked stop or segment. */
function MapCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="space-y-0.5 p-3 text-xs">
      <div className="text-sm font-bold leading-snug">{title}</div>
      {lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
    </div>
  );
}

const PANEL_PAD = { top: 24, bottom: 24, left: 320, right: 410 };
const weekly = (v3: LiveV3) => (v3.weekly ? kpiTiles(v3.weekly, weekDailyValues(v3)) : []);

/** The network's late share by hour, from each route's own by-hour shares weighted by their departures. */
function networkHours(s: AgencySummary) {
  return Array.from({ length: 24 }, (_, hour) => {
    let n = 0, late = 0;
    for (const r of s.routes) { const h = r.lateByHour.find(x => x.hour === hour); if (h) { n += h.n; late += h.value * h.n; } }
    return { hour, value: n ? late / n : 0, n };
  }).filter(x => x.n > 0);
}

const tileWidgets = (tiles: ReturnType<typeof weekly>): PanelWidget[] => tiles.map(k => ({ key: `tile-${k.key}`, size: 'small', tile: true, node: <KpiTile k={k} /> }));

/** The late-by-hour values of a route's whole day. */
const routeHours = (v3: LiveV3) => v3.bands.all.adherence.timepoints.all.byHour.filter(h => h.n > 0).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));

/** The widgets with nothing selected, in priority order: the network's tiles, late by hour, the stops where most cars leave late. */
function networkWidgets(s: AgencySummary, band: DashboardBand, onStop: (route: string, dir: number, stopId: string) => void): PanelWidget[] {
  const hours = networkHours(s);
  const rows = s.worstStops.slice(0, 3).map(x => ({ key: `${x.route}-${x.stopId}-${x.directionId}`, label: shortStopName(titleCase(x.name)), sub: x.routeLabel, value: pct(x.lateShare), onPick: () => onStop(x.route, x.directionId, x.stopId) }));
  return [
    ...tileWidgets(agencyKpiTiles(s)),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourWidget hours={hours} band={band} overall={s.weekly?.thisWeek.late?.share ?? null} /> }] : []),
    ...(rows.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title="Stops where the most cars leave late" rows={rows} /> }] : []),
  ];
}

/** The widgets for a route, in priority order: the picked stop or segment, the tiles, late by hour, run time, stops by hour, the worst stops. Whatever the window is too short for goes to a later page. */
function routeWidgets({ route, data, v3, dir, band, measure, pick, stops, setPick, onStringLine }: {
  onStringLine: () => void; route: string; data: { uncertainStart?: { directionId: number; stops: number }[] }; v3: LiveV3; dir: number; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; stops: ReturnType<typeof directionStopsById>; setPick: (p: MapPick | null) => void;
}): PanelWidget[] {
  const bandData = v3.bands[band] as DashboardBandData;
  const worst = rankStops(bandData.stops, dir, data.uncertainStart ?? []).slice(0, 3);
  const picked = pick?.kind === 'stop' ? stops.get(pick.stopId) : undefined;
  const sel = pick?.kind === 'segment'
    ? { title: `${shortStopName(stops.get(pick.fromStopId)?.name ?? pick.fromStopId)} to ${shortStopName(stops.get(pick.toStopId)?.name ?? pick.toStopId)}`, lines: segmentLines(bandData, dir, pick.fromStopId, pick.toStopId) }
    : picked ? { title: picked.name, lines: stopLines(v3, band, dir, picked) } : null;
  const hours = routeHours(v3);
  const hasRunTime = (v3.runningTime?.byHour[String(dir)] ?? []).filter(h => h.n >= 1).length >= 2;
  const hasHeat = measure !== 'runTime' && [...stops.keys()].some(id => v3.stopHours?.[String(dir)]?.[id]);
  return [
    ...(sel ? [{ key: 'selection', size: 'medium' as const, node: <Widget title={sel.title} size="medium"><div className="space-y-0.5 text-sm text-[var(--text-secondary)]">{sel.lines.map(l => <div key={l}>{l}</div>)}</div></Widget> }] : []),
    ...tileWidgets(weekly(v3)),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourWidget hours={hours} band={band} overall={v3.bands.all.adherence.timepoints.all.overall?.lateShare ?? null} /> }] : []),
    ...(hasRunTime ? [{ key: 'run-time', size: 'medium' as const, node: <RunTimeWidget v3={v3} dir={dir} band={band} /> }] : []),
    ...(hasHeat ? [{ key: 'stops-hour', size: 'large' as const, node: <StopHourWidget v3={v3} dir={dir} stops={stops} measure={measure} selectedStopId={pick?.kind === 'stop' ? pick.stopId : null} onPick={id => setPick({ kind: 'stop', stopId: id })} onStringLine={onStringLine} /> }] : []),
    ...(worst.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title="Stops with the most delay" rows={worst.map(x => ({ key: x.stopId, label: shortStopName(titleCase(x.name)), value: pct(x.lateShare), onPick: () => setPick({ kind: 'stop', stopId: x.stopId }) }))} /> }] : []),
  ];
}

/** The whole screen under the top bar: the map always, the overview on the left, the widgets on the right. */
function Body({ agency, s, route, setRoute, dir, setDir, band, measure, pick, setPick }: {
  agency: string; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; setPick: (p: MapPick | null) => void;
}) {
  const routes = useMemo(() => s.routes.map(r => r.route), [s]);
  const network = useNetworkData(agency, routes);
  const state = useLiveDashboard(route ? agency : null, route);
  const ready = route && state.kind === 'done' && state.data.status === 'ready' ? state.data : null;
  const v3 = useMemo(() => { if (!ready) return null; try { return withNiceNames(ready.v3); } catch { return ready.v3; } }, [ready]);
  const ids = v3 ? Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b) : [];
  const shown = v3 ? (dir != null && ids.includes(dir) ? dir : ids[0]) : 0;
  const uncertain = ready?.uncertainStart ?? [];
  const stops = useMemo(() => (v3 ? directionStopsById(v3, shown, band, uncertain) : new Map<string, RouteStripStop>()), [v3, shown, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const model: RouteMapModel = useMemo(() => {
    if (v3) return routeMapModel(v3, shown, band, measure);
    const segments: MapSegment[] = [];
    for (const [r, n3] of network) {
      const dirs = Object.keys(n3.directionLabels).map(Number).sort((a, b) => a - b);
      dirs.forEach((d, k) => { for (const seg of routeMapModel(n3, d, band, measure).segments) segments.push({ ...seg, route: r, label: r, offset: dirs.length > 1 ? (k === 0 ? 2.5 : -2.5) : 0 }); });
    }
    return { directionId: 0, segments, stops: [] };
  }, [v3, shown, band, measure, network]);
  const bandData = v3 ? (v3.bands[band] as DashboardBandData) : null;
  const anchor: [number, number] | null = pick?.kind === 'stop'
    ? model.stops.find(x => x.stopId === pick.stopId)?.lonLat ?? null
    : pick?.kind === 'segment' ? (() => { const c = model.segments.find(x => x.fromStopId === pick.fromStopId && x.toStopId === pick.toStopId)?.coordinates; return c ? c[Math.floor(c.length / 2)] : null; })() : null;
  const picked = pick?.kind === 'stop' ? stops.get(pick.stopId) : undefined;
  const card = v3 && bandData
    ? pick?.kind === 'segment' ? <MapCard title={`${shortStopName(stops.get(pick.fromStopId)?.name ?? pick.fromStopId)} to ${shortStopName(stops.get(pick.toStopId)?.name ?? pick.toStopId)}`} lines={segmentLines(bandData, shown, pick.fromStopId, pick.toStopId)} />
      : picked ? <MapCard title={picked.name} lines={stopLines(v3, band, shown, picked)} /> : null
    : null;
  const openStop = (r: string, d: number, stopId: string) => { setRoute(r); setDir(d); setPick({ kind: 'stop', stopId }); };
  const [stringOpen, setStringOpen] = useState(false);
  useEffect(() => { setStringOpen(false); }, [route, shown]);
  const widgets: PanelWidget[] = v3 && ready ? routeWidgets({ route: route!, data: ready, v3, dir: shown, band, measure, pick, stops, setPick, onStringLine: () => setStringOpen(true) }) : !route ? networkWidgets(s, band, openStop) : [];
  return (
    <div className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <RouteMap
          model={model} measure={measure} selected={pick} anchor={anchor} card={card} padding={PANEL_PAD}
          onPick={p => { if (!route && p?.kind === 'segment' && p.route) setRoute(p.route); else setPick(p); }}
          frameKey={route ? `${route}-${shown}` : `network-${network.size === routes.length ? 'all' : 'loading'}`}
        />
      </div>
      <div className="pointer-events-none absolute inset-3 flex gap-3">
        <div className="pointer-events-auto flex w-72 shrink-0 flex-col"><OverviewList s={s} measure={measure} route={route} network={network} onPick={r => { setRoute(r); setPick(null); }} /></div>
        <div className="relative min-w-0 flex-1">
          <Key measure={measure} />
          {ids.length > 1 && (
            <div className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-header)] px-2 py-1 shadow-sm">
              <Group label="Direction" value={String(shown)} onChange={v => { setDir(Number(v)); setPick(null); }} options={ids.map(d => [String(d), v3!.directionLabels[String(d)]] as const)} />
            </div>
          )}
          {ready?.note && <p className="pointer-events-none absolute bottom-0 left-0 right-0 m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{ready.note}</p>}
        </div>
        <WidgetPanel className="pointer-events-auto w-[24.5rem] shrink-0" widgets={widgets} />
      </div>
      {stringOpen && v3 && route && <StringLineView agency={agency} route={route} v3={v3} dir={shown} onClose={() => setStringOpen(false)} />}
    </div>
  );
}

/** The Live planner: the map always, the agency overview on the left, widgets that follow the selection on the right. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [route, setRoute] = useState<string | null>(() => readParam('route'));
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [measure, setMeasure] = useState<MapMeasure>(() => { const m = readParam('measure'); return MEASURES.some(([k]) => k === m) ? (m as MapMeasure) : 'late'; });
  const [pick, setPick] = useState<MapPick | null>(() => {
    const stop = readParam('stop'), seg = readParam('seg');
    if (stop) return { kind: 'stop', stopId: stop };
    const [f, t] = (seg ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  useEffect(() => {
    syncUrlParams({
      view: null, tab: null, route, dir: dir == null ? null : String(dir), band: band === 'all' ? null : band, measure: measure === 'late' ? null : measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, seg: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    });
  }, [route, dir, band, measure, pick]);
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
        <RoutePicker s={s} route={route} onPick={r => { setRoute(r); setPick(null); }} />
        <Group label="Measure" value={measure} onChange={v => setMeasure(v as MapMeasure)} options={MEASURES} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </header>
      <Body agency={agency} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} pick={pick} setPick={setPick} />
    </>,
  );
}
