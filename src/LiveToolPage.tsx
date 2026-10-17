import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';

import { minutesText } from '../shared/liveFormat';
import { LATE_SHORT, LATE_THRESHOLD } from '../shared/liveWording';
import type { AgencySummary } from '../shared/liveAgency';
import { weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import { titleCase } from './utils/format';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { kpiTiles, type Kpi } from './utils/liveKpi';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasBrand from './components/AtlasBrand';
import RouteMap, { type MapPick } from './components/Live/RouteMap';
import { directionStopsById } from './components/Live/DirectionStrip';
import { MAP_STEP_LIMITS, MEASURES, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from './components/Live/routeMapModel';
import { STEP_LABELS, stopDetail, type RouteStripStop } from './components/Live/routeStripModel';
import Widget from './components/Live/tool/Widget';
import WidgetPanel, { type PanelWidget } from './components/Live/tool/WidgetPanel';
import OverviewList from './components/Live/tool/OverviewList';
import LateByHourSection, { routeLateDays, routeLateOfDays, routeLateHours, routeLateOverall } from './components/Live/sections/LateByHourSection';
import ProblemsWidget from './components/Live/tool/ProblemsWidget';
import { worstStopRows } from './components/Live/sections/WorstStopsSection';
import RunTimeWidget from './components/Live/tool/RunTimeWidget';
import useNetworkData, { type ReadyRoute } from './components/Live/tool/useNetworkData';
import { KpiRows, KpiTile } from './LiveDashboardView';
import { NOISE_RULE } from '../shared/liveDashboard';
import { BANDS } from './LiveExplorePage';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import { DataUpTo, withNiceNames } from './LiveRoutePage';

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
  return [...stopDetail(stop).lines, ...(extra ? [`Extra wait ${minutesText(Math.max(0, extra.extraWaitMin))}`] : [])];
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

const PANEL_PAD = { top: 24, bottom: 24, left: 410, right: 410 };
const NARROW_PAD = { top: 56, bottom: 24, left: 24, right: 24 };
/** What the route's week figures cover (the Run time tile's own scope wording). */
const BOTH_DIRECTIONS = 'both directions';
const weekly = (v3: LiveV3) => (v3.weekly ? kpiTiles(v3.weekly, weekDailyValues(v3)) : []);

/** The network's late share by hour, from each route's own by-hour shares weighted by their departures. */
function networkHours(s: AgencySummary) {
  return Array.from({ length: 24 }, (_, hour) => {
    let n = 0, late = 0;
    for (const r of s.routes) { const h = r.lateByHour.find(x => x.hour === hour); if (h) { n += h.n; late += h.value * h.n; } }
    return { hour, value: n ? late / n : 0, n };
  }).filter(x => x.n > 0);
}

/** The left panel's one-line explanations (approved by Ryan, 2026-10-17): Run time and Service delivered have none. */
const MATH: Partial<Record<Kpi['key'], string>> = { late: LATE_SHORT, extraWait: 'from the gaps between vehicles', bunching: 'gaps under 2 min or over 2× scheduled' };
/** Under the left panel's tiles; the full rule is its hover text. */
const NOISE_CAPTION = 'Grey = within normal day-to-day change';
/** The route panel's tiles are bare (figure and change): the explanations are shown once, on the left. */
const tileWidgets = (tiles: ReturnType<typeof weekly>): PanelWidget[] => tiles.map((k, i) => ({
  key: `tile-${k.key}`, size: 'small' as const, tile: true,
  node: (
    <>
      <KpiTile k={k} bare />
      {/* The week's figures cover the whole route, while Run time and the stops follow the direction pills. Said once, in the 12px gap under the last row of tiles (from the row's left tile, for any number of tiles), so it takes no height. */}
      {i === tiles.length - (tiles.length % 2 || 2) && <span className="pointer-events-none absolute left-2 top-full whitespace-nowrap text-xs leading-3 text-[var(--text-dim)]">{BOTH_DIRECTIONS}</span>}
    </>
  ),
}));

/** The network's summary, always on the left: the week's figures as one-line rows, then late departures by hour. */
function summaryWidgets(s: AgencySummary, band: DashboardBand): PanelWidget[] {
  const hours = networkHours(s);
  const tiles = agencyKpiTiles(s);
  return [
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <KpiRows tiles={tiles} math={MATH} caption={NOISE_CAPTION} captionTitle={NOISE_RULE} /> }] : []),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourSection chart="mini" hours={hours} band={band} overall={s.weekly?.thisWeek.late?.share ?? null} days={s.weekly?.thisWeek.healthyDates.length} ofDays={s.weekly?.thisWeek.dates.length} height={56} /> }] : []),
  ];
}

/** The widgets with nothing selected: the network's worst places, each a clickable list at full width. */
function networkWidgets(s: AgencySummary, onOpen: (route: string, dir: number, pick: MapPick) => void): PanelWidget[] {
  const label = (r: string) => s.routes.find(x => x.route === r)?.label ?? r;
  const stopRows = s.worstStops.slice(0, 5).map(x => ({ key: `${x.route}-${x.stopId}-${x.directionId}`, label: shortStopName(titleCase(x.name)), sub: x.routeLabel, value: pct(x.lateShare), onPick: () => onOpen(x.route, x.directionId, { kind: 'stop', stopId: x.stopId }) }));
  const stretchRows = (list: AgencySummary['delayStarts'], value: (v: number) => string) => list.slice(0, 5).map(x => ({ key: `${x.route}-${x.directionId}-${x.fromStopId}-${x.toStopId}`, label: `${shortStopName(titleCase(x.fromName))} to ${shortStopName(titleCase(x.toName))}`, sub: label(x.route), value: value(x.value), onPick: () => onOpen(x.route, x.directionId, { kind: 'segment', fromStopId: x.fromStopId, toStopId: x.toStopId }) }));
  const delays = stretchRows(s.delayStarts, mins), bunching = stretchRows(s.bunchingForms, pct);
  return [
    ...(stopRows.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title="Stops most often late" intro={`The ${stopRows.length} stops with the highest share of departures ${LATE_THRESHOLD}, across all analysed routes.`} rows={stopRows} /> }] : []),
    ...(delays.length ? [{ key: 'delays', size: 'medium' as const, node: <ProblemsWidget title="Where delays start" intro="Route directions where delay jumps on one stretch and stays up, and the typical minutes it adds there." rows={delays} /> }] : []),
    ...(bunching.length ? [{ key: 'bunching', size: 'medium' as const, node: <ProblemsWidget title="Where bunching forms" intro="Route directions where the share of gaps that are too short or too long steps up on one stretch and stays up." rows={bunching} /> }] : []),
  ];
}

/** The left panel's heading: the agency's name, as the pages write it. */
const headingWidget = (text: string): PanelWidget => ({ key: 'heading-agency', size: 'medium', node: <h2 className="m-0 truncate text-sm font-bold text-[var(--text-primary)]">{text}</h2> });

/** The widgets for a route: the week's tiles and the run time summary at half width, late by hour and the worst stops at full width. A picked stop or segment shows in the map popover only. */
function routeWidgets({ data, v3, dir, band, setPick }: {
  data: { uncertainStart?: { directionId: number; stops: number }[] }; v3: LiveV3; dir: number; band: DashboardBand; setPick: (p: MapPick | null) => void;
}): PanelWidget[] {
  const bandData = v3.bands[band] as DashboardBandData;
  const worst = worstStopRows(v3, bandData, dir, data.uncertainStart ?? [], 3, stopId => setPick({ kind: 'stop', stopId }));
  const hours = routeLateHours(v3);
  const hasRunTime = !!v3.runningTime?.bands[band]?.[String(dir)];
  return [
    ...tileWidgets(weekly(v3)),
    ...(hasRunTime ? [{ key: 'run-time', size: 'medium' as const, node: <RunTimeWidget v3={v3} dir={dir} band={band} /> }] : []),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourSection chart="mini" hours={hours} band={band} overall={routeLateOverall(v3)} days={routeLateDays(v3)} ofDays={routeLateOfDays(v3)} scope={BOTH_DIRECTIONS} /> }] : []),
    ...(worst.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title="Stops most often late" rows={worst} /> }] : []),
  ];
}

/** The right panel while a picked route's figures are on their way: the page's own word and soft grey blocks where the figures will be. */
function LoadingWidget() {
  return (
    <Widget title="Loading…" size="medium">
      <div aria-busy="true" className="flex flex-col gap-3">
        {[40, 72, 56].map(h => <div key={h} className="rounded-lg bg-[var(--bg-btn-hover)]" style={{ height: h }} />)}
      </div>
    </Widget>
  );
}

/** The whole screen under the top bar: the map always, the overview on the left, the widgets on the right. */
function Body({ agency, s, route, setRoute, dir, setDir, dirSlot, routeSlot, dataSlot, band, measure, pick, setPick }: {
  agency: string; dirSlot: HTMLElement | null; routeSlot: HTMLElement | null; dataSlot: HTMLElement | null; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; pick: MapPick | null; setPick: (p: MapPick | null) => void;
}) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const routes = useMemo(() => s.routes.map(r => r.route), [s]);
  const network = useNetworkData(agency, routes, route);
  // A route whose file was already fetched with the network opens at once; otherwise it is fetched. Until the new route's
  // data is there the previous route's stays on screen and is swapped in place (no blank panel, no map jump).
  const own = useLiveDashboard(route && !network.has(route) ? agency : null, route);
  const fetched = route && own.kind === 'done' && own.data.status === 'ready' && own.data.route === route ? own.data : null;
  const fresh: ReadyRoute | null = route ? network.get(route) ?? fetched : null;
  const last = useRef<ReadyRoute | null>(null);
  if (fresh) last.current = fresh;
  const ready: ReadyRoute | null = route ? fresh ?? last.current : null;
  const v3 = useMemo(() => { if (!ready) return null; try { return withNiceNames(ready.v3); } catch { return ready.v3; } }, [ready]);
  const networkV3 = useMemo(() => new Map([...network].map(([r, b]) => [r, b.v3])), [network]);
  const ids = v3 ? Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b) : [];
  const shown = v3 ? (dir != null && ids.includes(dir) ? dir : ids[0]) : 0;
  const uncertain = ready?.uncertainStart ?? [];
  const stops = useMemo(() => (v3 ? directionStopsById(v3, shown, band, uncertain) : new Map<string, RouteStripStop>()), [v3, shown, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const model: RouteMapModel = useMemo(() => {
    if (v3) return routeMapModel(v3, shown, band, measure);
    const segments: MapSegment[] = [];
    for (const [r, nb] of network) {
      const n3 = nb.v3;
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
  const summary = useMemo(() => [headingWidget(agency.toUpperCase()), ...summaryWidgets(s, band)], [s, band, agency]);
  const widgets: PanelWidget[] = v3 && ready ? routeWidgets({ data: ready, v3, dir: shown, band, setPick }) : !route ? networkWidgets(s, (r, d, p) => { setRoute(r); setDir(d); setPick(p); }) : own.kind === 'loading' ? [{ key: 'loading', size: 'medium' as const, node: <LoadingWidget /> }] : [];
  // The map note sits over the map's bottom edge: the route is framed above it (its measured height plus its inset and a gap).
  const [noteEl, setNoteEl] = useState<HTMLElement | null>(null);
  const [noteH, setNoteH] = useState(0);
  useEffect(() => {
    if (!noteEl) { setNoteH(0); return; }
    const read = () => setNoteH(Math.ceil(noteEl.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(noteEl);
    return () => ro.disconnect();
  }, [noteEl]);
  const framePad = (pad: typeof PANEL_PAD) => ({ ...pad, bottom: Math.max(pad.bottom, noteH ? noteH + 12 + 12 : 0) });
  const note = ready?.note && <p ref={setNoteEl} className="pointer-events-none absolute bottom-0 left-0 right-10 m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{ready.note}</p>;
  const mapEl = (
    <RouteMap
      model={model} measure={measure} selected={pick} anchor={anchor} card={card} padding={framePad(wide ? PANEL_PAD : NARROW_PAD)}
      controlsRight={wide ? 'calc(24.5rem + 24px)' : 12}
      onPick={p => { if (!route && p?.kind === 'segment' && p.route) setRoute(p.route); else setPick(p); }}
      frameKey={ready && route ? `route-${ready.route}-${noteH}` : `network-${network.size === routes.length ? 'all' : 'loading'}`}
    />
  );
  // The direction switch sits in the top bar with the other pills.
  const direction = ids.length > 1 && dirSlot ? createPortal(<PillGroup label="Direction" value={String(shown)} onChange={v => { setDir(Number(v)); setPick(null); }} options={ids.map(d => [String(d), v3!.directionLabels[String(d)]] as const)} />, dirSlot) : null;
  // The picked route's name, in the top bar beside the direction pills (the name the route page's title uses).
  const routeName = routeSlot && ready && route ? createPortal(<h2 className="m-0 whitespace-nowrap text-sm font-bold">{ready.routeTitle || `${agency.toUpperCase()} ${ready.route}`}</h2>, routeSlot) : null;
  // The newest day in the figures, in the header: the picked route's, or the network summary's week.
  const upTo = dataSlot ? createPortal(<DataUpTo dates={v3 ? v3.window.dates : route ? [] : s.weekly?.thisWeek.dates ?? []} route={v3 ? ready?.route : ''} />, dataSlot) : null;
  if (!wide) {
    // Narrow screens: the map on top, the widgets under it; the page scrolls, no panel does.
    return (
      <div className="relative min-h-0 flex-1">
        {routeName}{direction}{upTo}
        <div className="absolute inset-0 overflow-y-auto">
          <div className="relative h-[55vh] min-h-[22rem]">
            <div className="absolute inset-0">{mapEl}</div>
            <div className="pointer-events-none absolute inset-3"><Key measure={measure} />{note}</div>
          </div>
          <WidgetPanel className="p-3" widgets={[...summary, ...widgets]} />
          <div className="flex p-3 pt-0"><OverviewList s={s} measure={measure} route={route} network={networkV3} onPick={r => { setRoute(r); setPick(null); }} /></div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      {routeName}{direction}{upTo}
      <div className="absolute inset-0">{mapEl}</div>
      <div className="pointer-events-none absolute inset-3 flex gap-3">
        <div className="pointer-events-auto flex w-[24.5rem] shrink-0 flex-col gap-2">
          <WidgetPanel widgets={summary} />
          <OverviewList s={s} measure={measure} route={route} network={networkV3} onPick={r => { setRoute(r); setPick(null); }} />
        </div>
        <div className="relative min-w-0 flex-1">
          <Key measure={measure} />
          {note}
        </div>
        <WidgetPanel className="pointer-events-auto w-[24.5rem] shrink-0" widgets={widgets} />
      </div>
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
  const [dirSlot, setDirSlot] = useState<HTMLElement | null>(null);
  const [routeSlot, setRouteSlot] = useState<HTMLElement | null>(null);
  const [dataSlot, setDataSlot] = useState<HTMLElement | null>(null);
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
      <header className={`${PILL_ROW} border-b border-[var(--border-primary)] bg-[var(--bg-header)] px-4 py-2`}>
        <a href="/" aria-label="Atlas by Civic Minds"><AtlasBrand /></a>
        <button type="button" onClick={() => { setRoute(null); setPick(null); }} className="text-sm font-bold hover:underline">{agency.toUpperCase()}</button>
        <div ref={setRouteSlot} className="contents" />
        <div ref={setDirSlot} className="contents" />
        <PillGroup label="Measure" value={measure} onChange={v => setMeasure(v as MapMeasure)} options={MEASURES} />
        <PillGroup label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
        <div ref={setDataSlot} className="contents" />
      </header>
      <Body agency={agency} dirSlot={dirSlot} routeSlot={routeSlot} dataSlot={dataSlot} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} pick={pick} setPick={setPick} />
    </>,
  );
}
