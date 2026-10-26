import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';

import { minutesText } from '../shared/liveFormat';
import { LATE_SHORT, excludingWeeksText, leftOutReason } from '../shared/liveWording';
import type { AgencySummary } from '../shared/liveAgency';
import { weekDailyValues, type UncertainStart, type DashboardBand, type DashboardBandData, type LiveV3 } from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { stretchLabel } from './utils/stopLabel';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { kpiTiles, leftOutDates, type Kpi } from './utils/liveKpi';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasLogo from './components/AtlasLogo';
import RouteMap, { type MapPick } from './components/Live/RouteMap';
import { directionStopsById } from './components/Live/DirectionStrip';
import { DELAY_STARTS_LABEL, MAP_STEP_LIMITS, MEASURES, measureLabel, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from './components/Live/routeMapModel';
import { delayHeatPoints } from './components/Live/delayHeatModel';
import { STEP_LABELS, stopDetail, type RouteStripStop } from './components/Live/routeStripModel';
import Widget from './components/Live/tool/Widget';
import WidgetPanel, { type PanelWidget } from './components/Live/tool/WidgetPanel';
import OverviewList from './components/Live/tool/OverviewList';
import LateByHourSection, { routeLateDays, routeLeftOut, routeLateHours, routeLateOverall } from './components/Live/sections/LateByHourSection';
import ProblemsWidget from './components/Live/tool/ProblemsWidget';
import { worstStopRows } from './components/Live/sections/WorstStopsSection';
import RunTimeWidget from './components/Live/tool/RunTimeWidget';
import useNetworkData, { type ReadyRoute } from './components/Live/tool/useNetworkData';
import { WeekTable } from './LiveDashboardView';
import { NOISE_RULE } from '../shared/liveDashboard';
import { BANDS } from './LiveExplorePage';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import Pill from './components/ui/Pill';
import LegendItem from './components/ui/LegendItem';
import { MAP_BADGE, MAP_BADGE_LABEL } from './styles';
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

/** The heatmap prototype's one line on what the colour means (CIV-942, wording to confirm). */
const DELAY_STARTS_NOTE = 'Typical minutes of delay added since the previous stop that stay for the next 3 stops';
/** The stop card's line for that figure (wording to confirm). */
const DELAY_STAYS = 'Added and kept';

/** The measures, on the map at the top left: they change only the map and the route list, so they sit with them. "Delay starts" (the CIV-942 heatmap) is one of the set. */
const MAP_MEASURES: ReadonlyArray<readonly [MapMeasure, string]> = [...MEASURES, ['delayStarts', DELAY_STARTS_LABEL]];
function MeasurePills({ measure, setMeasure }: { measure: MapMeasure; setMeasure: (m: MapMeasure) => void }) {
  return (
    <div role="group" aria-label="Measure" className="pointer-events-auto absolute left-0 top-0 z-10 flex flex-wrap gap-1.5">
      {MAP_MEASURES.map(([k, text]) => <Pill key={k} size="segment" tone="glass" selected={measure === k} onClick={() => setMeasure(k)}>{text}</Pill>)}
    </div>
  );
}

/** The map's key, as a row of pills along the bottom of the map (the regular map's legend pills). */
function Key({ measure }: { measure: MapMeasure }) {
  const labels = stepLabels(measure);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {measure === 'delayStarts' && <div className={`${MAP_BADGE} h-8`}><span className={MAP_BADGE_LABEL}>{DELAY_STARTS_NOTE}</span></div>}
      <div className={`${MAP_BADGE} h-8 gap-3`} role="group" aria-label="Map colours">
        <span className="text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}</span>
        {labels.map((l, i) => <LegendItem key={l} kind="line" color={STEP_VAR(measure, i)}><span className={MAP_BADGE_LABEL}>{l}</span></LegendItem>)}
        <LegendItem kind="line" color="var(--strip-delay-0)" swatchClassName="opacity-45"><span className={MAP_BADGE_LABEL}>Not measured</span></LegendItem>
      </div>
    </div>
  );
}

/** The lines of a stop's card: the trimmed figures the strip's hover shows, then its extra wait where it has one. */
function stopLines(v3: LiveV3, band: DashboardBand, dir: number, stop: RouteStripStop, measure: MapMeasure, uncertain: readonly UncertainStart[]): string[] {
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === stop.stopId);
  // Delay starts: the figure the map colours by, then the stretch into this stop in the segment card's own words. Only for
  // a stop the map measures (never a terminal stretch or one with too few trips).
  const heat = measure === 'delayStarts' ? delayHeatPoints(new Map([['', v3]]), band, { only: { route: '', directionId: dir }, uncertain: () => uncertain }).find(p => p.stopId === stop.stopId) : undefined;
  return [...(heat ? [`${DELAY_STAYS} ${mins(heat.addedMin)}`, ...segmentLines(v3.bands[band] as DashboardBandData, dir, heat.fromStopId, stop.stopId)] : []), ...stopDetail(stop).lines, ...(extra ? [`Extra wait ${minutesText(Math.max(0, extra.extraWaitMin))}`] : [])];
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

const PANEL_PAD = { top: 56, bottom: 24, left: 410, right: 24 };
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
const MATH: readonly string[] = [LATE_SHORT, 'longer wait than scheduled, from the gaps between vehicles', 'too close · too far apart (gaps under 2 min or over 2× scheduled)'];
/** Under the left panel's tiles; the full rule is its hover text. */
const NOISE_CAPTION = 'Grey = within normal day-to-day change';
/** The network's summary, on the left with no route picked: the week's figures as one-line rows, then late departures by hour. */
function summaryWidgets(s: AgencySummary, band: DashboardBand): PanelWidget[] {
  const thisLeft = s.weekly ? leftOutDates(s.weekly.thisWeek) : [], lastLeft = s.weekly ? leftOutDates(s.weekly.lastWeek) : [];
  const weekLeft = { text: excludingWeeksText(thisLeft, lastLeft), title: leftOutReason([...lastLeft, ...thisLeft]) };
  const hours = networkHours(s);
  const tiles = agencyKpiTiles(s);
  return [
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope={s.agency.toUpperCase()} notes={MATH} caption={NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourSection chart="mini" hours={hours} band={band} overall={s.weekly?.thisWeek.late?.share ?? null} days={s.weekly?.thisWeek.healthyDates.length} leftOut={s.weekly ? leftOutDates(s.weekly.thisWeek) : []} height={56} /> }] : []),
  ];
}

/** The left panel's heading: the agency's name, as the pages write it. */
const headingWidget = (text: string): PanelWidget => ({ key: 'heading-agency', size: 'medium', node: <h2 className="m-0 truncate text-sm font-bold text-[var(--text-primary)]">{text}</h2> });

/** The figures for a route, in the one left panel: the week's figures in the same table as the network's, then the run time strip, late by hour and the worst stops. A picked stop or segment shows in the map popover only. */
function routeWidgets({ data, v3, dir, band, setPick, route }: {
  data: { uncertainStart?: { directionId: number; stops: number }[] }; v3: LiveV3; dir: number; band: DashboardBand; setPick: (p: MapPick | null) => void; route: string;
}): PanelWidget[] {
  const bandData = v3.bands[band] as DashboardBandData;
  const worst = worstStopRows(v3, bandData, dir, data.uncertainStart ?? [], 3, stopId => setPick({ kind: 'stop', stopId }));
  const hours = routeLateHours(v3);
  const hasRunTime = !!v3.runningTime?.bands[band]?.[String(dir)];
  const tiles = weekly(v3);
  const thisLeft = v3.weekly ? leftOutDates(v3.weekly.thisWeek) : [], lastLeft = v3.weekly ? leftOutDates(v3.weekly.lastWeek) : [];
  const weekLeft = { text: excludingWeeksText(thisLeft, lastLeft), title: leftOutReason([...lastLeft, ...thisLeft]) };
  return [
    // The week's figures cover the whole route (both directions), while Run time and the stops follow the direction pills.
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope={`${route} · ${BOTH_DIRECTIONS}`} notes={MATH} caption={NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
    ...(hasRunTime ? [{ key: 'run-time', size: 'medium' as const, node: <RunTimeWidget v3={v3} dir={dir} band={band} /> }] : []),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourSection chart="mini" hours={hours} band={band} overall={routeLateOverall(v3)} days={routeLateDays(v3)} leftOut={routeLeftOut(v3)} scope={BOTH_DIRECTIONS} height={40} /> }] : []),
    ...(worst.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title="Stops most often late" rows={worst} /> }] : []),
  ];
}

/** The panel while a picked route's figures are on their way: the page's own word and soft grey blocks where the figures will be. */
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
function Body({ agency, s, route, setRoute, dir, setDir, dirSlot, routeSlot, dataSlot, band, measure, setMeasure, pick, setPick }: {
  agency: string; dirSlot: HTMLElement | null; routeSlot: HTMLElement | null; dataSlot: HTMLElement | null; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; setMeasure: (m: MapMeasure) => void; pick: MapPick | null; setPick: (p: MapPick | null) => void;
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
    if (v3) return routeMapModel(v3, shown, band, measure, uncertain);
    const segments: MapSegment[] = [];
    for (const [r, nb] of network) {
      const n3 = nb.v3;
      const dirs = Object.keys(n3.directionLabels).map(Number).sort((a, b) => a - b);
      dirs.forEach((d, k) => { for (const seg of routeMapModel(n3, d, band, measure).segments) segments.push({ ...seg, route: r, label: r, offset: dirs.length > 1 ? (k === 0 ? 2.5 : -2.5) : 0 }); });
    }
    return { directionId: 0, segments, stops: [] };
  }, [v3, shown, band, measure, network]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = useMemo(() => {
    if (measure !== 'delayStarts') return null;
    if (v3 && route) return delayHeatPoints(new Map([[route, v3]]), band, { only: { route, directionId: shown }, uncertain: () => uncertain });
    return v3 ? null : delayHeatPoints(networkV3, band);
  }, [measure, v3, route, shown, band, networkV3]); // eslint-disable-line react-hooks/exhaustive-deps
  const bandData = v3 ? (v3.bands[band] as DashboardBandData) : null;
  const anchor: [number, number] | null = pick?.kind === 'stop'
    ? model.stops.find(x => x.stopId === pick.stopId)?.lonLat ?? null
    : pick?.kind === 'segment' ? (() => { const c = model.segments.find(x => x.fromStopId === pick.fromStopId && x.toStopId === pick.toStopId)?.coordinates; return c ? c[Math.floor(c.length / 2)] : null; })() : null;
  const picked = pick?.kind === 'stop' ? stops.get(pick.stopId) : undefined;
  const card = v3 && bandData
    ? pick?.kind === 'segment' ? <MapCard title={stretchLabel(stops.get(pick.fromStopId)?.name ?? pick.fromStopId, stops.get(pick.toStopId)?.name ?? pick.toStopId)} lines={segmentLines(bandData, shown, pick.fromStopId, pick.toStopId)} />
      : picked ? <MapCard title={picked.name} lines={stopLines(v3, band, shown, picked, measure, uncertain)} /> : null
    : null;
  const summary = useMemo(() => [headingWidget(agency.toUpperCase()), ...summaryWidgets(s, band)], [s, band, agency]);
  const backToNetwork = () => { setRoute(null); setPick(null); };
  // One panel, on the left: the network's overview with no route picked; the route's own figures once one is picked, with a way back.
  const back: PanelWidget = { key: 'back', size: 'medium', node: <button type="button" onClick={backToNetwork} className="text-sm font-bold text-[var(--text-primary)] hover:underline">← {agency.toUpperCase()}</button> };
  const routePanel: PanelWidget[] | null = !route ? null
    : v3 && ready ? [back, ...routeWidgets({ data: ready, v3, dir: shown, band, setPick, route: ready.route })]
    : [back, ...(own.kind === 'loading' ? [{ key: 'loading', size: 'medium' as const, node: <LoadingWidget /> }] : [])];
  // The map note sits over the map's bottom edge: the route is framed above it (its measured height plus its inset and a gap).
  const [noteEl, setNoteEl] = useState<HTMLElement | null>(null);
  const [noteH, setNoteH] = useState(0);
  useEffect(() => {
    if (!noteEl) { if (!ready?.note) setNoteH(0); return; }
    const read = () => setNoteH(Math.ceil(noteEl.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(noteEl);
    return () => ro.disconnect();
  }, [noteEl]); // eslint-disable-line react-hooks/exhaustive-deps
  const framePad = (pad: typeof PANEL_PAD) => ({ ...pad, bottom: Math.max(pad.bottom, noteH ? noteH + 12 + 12 : 0) });
  // The note is about delay at the first stops: it shows in the delay-based views (Late, Run time), not for the gap-based ones (Extra wait, Bunching).
  const showNote = ready?.note && (measure === 'late' || measure === 'runTime' || measure === 'delayStarts');
  // The bottom of the map: the note (when it applies) above the key's row of pills. The route is framed above both.
  const note = (
    <div ref={setNoteEl} className="pointer-events-none absolute bottom-0 left-0 right-12 flex flex-col items-start gap-2">
      {showNote && <p className="m-0 rounded-lg bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm">{ready!.note}</p>}
      <Key measure={measure} />
    </div>
  );
  const mapEl = (
    <RouteMap
      model={model} measure={measure} heat={heat} selected={pick} anchor={anchor} card={card} padding={framePad(wide ? PANEL_PAD : NARROW_PAD)}
      controlsRight={12}
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
            <div className="pointer-events-none absolute inset-3"><MeasurePills measure={measure} setMeasure={setMeasure} />{note}</div>
          </div>
          <WidgetPanel className="p-3" widgets={routePanel ?? summary} />
          {!routePanel && <div className="flex p-3 pt-0"><OverviewList s={s} measure={measure} band={band} route={route} network={networkV3} onPick={r => { setRoute(r); setPick(null); }} /></div>}
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
          {routePanel ? <WidgetPanel widgets={routePanel} /> : <>
            <WidgetPanel widgets={summary} />
            <OverviewList s={s} measure={measure} band={band} route={route} network={networkV3} onPick={r => { setRoute(r); setPick(null); }} />
          </>}
        </div>
        <div className="relative min-w-0 flex-1">
          <MeasurePills measure={measure} setMeasure={setMeasure} />
          {note}
        </div>
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
  const [measure, setMeasure] = useState<MapMeasure>(() => { const m = readParam('measure'); return MEASURES.some(([k]) => k === m) || m === 'delayStarts' ? (m as MapMeasure) : 'late'; });
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
        <AtlasLogo href="/" ariaLabel="Atlas by Civic Minds" showMark={false} />
        <button type="button" onClick={() => { setRoute(null); setPick(null); }} className="text-sm font-bold hover:underline">{agency.toUpperCase()}</button>
        <div ref={setRouteSlot} className="contents" />
        <div ref={setDirSlot} className="contents" />
        <PillGroup label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
        <div ref={setDataSlot} className="contents" />
      </header>
      <Body agency={agency} dirSlot={dirSlot} routeSlot={routeSlot} dataSlot={dataSlot} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} setMeasure={setMeasure} pick={pick} setPick={setPick} />
    </>,
  );
}
