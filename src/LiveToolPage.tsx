import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { FEATURES } from '../shared/config';

import { minutesText } from '../shared/liveFormat';
import { excludingWeeksText, leftOutReason } from '../shared/liveWording';
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
import { stopCardGroups, type CardGroup } from './components/Live/stopCardModel';
import { STEP_LABELS, stopDetail, type RouteStripStop } from './components/Live/routeStripModel';
import Widget from './components/Live/tool/Widget';
import WidgetPanel, { type PanelWidget } from './components/Live/tool/WidgetPanel';
import OverviewList from './components/Live/tool/OverviewList';
import { rankRoutes } from './components/Live/overviewListModel';
import LateByHourSection, { routeLateDays, routeLeftOut, routeLateHours, routeLateOverall } from './components/Live/sections/LateByHourSection';
import ProblemsWidget from './components/Live/tool/ProblemsWidget';
import { worstStopRows } from './components/Live/sections/WorstStopsSection';
import RunTimeWidget from './components/Live/tool/RunTimeWidget';
import useNetworkData, { type ReadyRoute } from './components/Live/tool/useNetworkData';
import { WeekTable } from './LiveDashboardView';
import { NOISE_RULE } from '../shared/liveDashboard';
import { BANDS } from './LiveExplorePage';
import { PILL_ROW } from './components/ui/PillGroup';
import Pill from './components/ui/Pill';
import LegendItem from './components/ui/LegendItem';
import { MAP_BADGE, MAP_BADGE_LABEL, PHONE_TAP_AREA } from './styles';
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

/** Delay starts' definition, after its name in the key (Ryan, 2026-10-26, word for word). */
const DELAY_STARTS_NOTE = 'delay added that lasts 3+ stops';
/** The stop card's line for that figure (wording to confirm). */
const DELAY_STAYS = 'Added and kept';

/** The measures, on the map at the top right: they change only the map and the route list, so they sit with them. "Delay starts" (the CIV-942 heatmap) is one of the set. */
const MAP_MEASURES: ReadonlyArray<readonly [MapMeasure, string]> = [...MEASURES, ['delayStarts', DELAY_STARTS_LABEL]];
function MeasurePills({ measure, setMeasure }: { measure: MapMeasure; setMeasure: (m: MapMeasure) => void }) {
  return (
    <div role="group" aria-label="Measure" className="pointer-events-auto absolute right-0 top-0 z-10 flex flex-wrap justify-end gap-1.5">
      {MAP_MEASURES.map(([k, text]) => <Pill key={k} size="segment" tone="glass" selected={measure === k} onClick={() => setMeasure(k)}>{text}</Pill>)}
    </div>
  );
}

/** The time of day as one pill showing the current period; a click opens a small menu with the five choices. */
function PeriodMenu({ band, setBand }: { band: DashboardBand; setBand: (b: DashboardBand) => void }) {
  return <PillMenu label="Time of day" value={band} options={BANDS} onPick={k => setBand(k as DashboardBand)} />;
}

/** One pill showing the current choice; a click opens the choices under it (the time of day and route menus). */
function PillMenu({ label, value, options, onPick, alignRight = false }: { label: string; value: string; options: ReadonlyArray<readonly [string, string]>; onPick: (k: string) => void; alignRight?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Pill size="segment" selected className={PHONE_TAP_AREA} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}>
        {options.find(([k]) => k === value)?.[1]}<span aria-hidden="true" className="ml-1">▾</span>
      </Pill>
      {open && (
        <div role="menu" aria-label={label} className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-50 mt-1 flex min-w-full flex-col gap-0.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-1 shadow-lg`}>
          {options.map(([k, text]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={k === value} onClick={() => { onPick(k); setOpen(false); }}
              // A finger-sized row on phones (44px), the compact row with a pointer (#1151).
              className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-left text-xs font-bold max-sm:min-h-[44px] ${k === value ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The picked measure's one-line definition, first in the key (Ryan, 2026-10-26, word for word). Run time has none; Delay starts' is its note. */
const KEY_DEFINITION: Partial<Record<MapMeasure, string>> = { late: '5½+ min late', extraWait: 'wait beyond the scheduled gap', bunching: 'gaps under 2 min or over 2× scheduled', delayStarts: DELAY_STARTS_NOTE };

/** The map's key, as a row of pills at the bottom right of the map, clear of the zoom buttons (the regular map's legend pills). */
function Key({ measure }: { measure: MapMeasure }) {
  const labels = stepLabels(measure);
  return (
    // On a phone the pills wrap inside the map's width; each label keeps its words on one line (#1151).
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      {KEY_DEFINITION[measure] && <div className={`${MAP_BADGE} min-h-8 max-w-full py-1`}><span className={MAP_BADGE_LABEL}>{KEY_DEFINITION[measure]}</span></div>}
      <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label="Map colours">
        <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}</span>
        {labels.map((l, i) => <LegendItem key={l} kind="line" color={STEP_VAR(measure, i)}><span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span></LegendItem>)}
        <LegendItem kind="line" color="var(--strip-delay-0)" swatchClassName="opacity-45"><span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>Not measured</span></LegendItem>
      </div>
    </div>
  );
}

/** The lines of a stop's card: the trimmed figures the strip's hover shows, then its extra wait where it has one. */
function stopLines(v3: LiveV3, band: DashboardBand, dir: number, stop: RouteStripStop, measure: MapMeasure, uncertain: readonly UncertainStart[]): CardGroup[] {
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === stop.stopId);
  // Delay starts: the figure the map colours by, then the stretch into this stop in the segment card's own words. Only for
  // a stop the map measures (never a terminal stretch or one with too few trips).
  const heat = measure === 'delayStarts' ? delayHeatPoints(new Map([['', v3]]), band, { only: { route: '', directionId: dir }, uncertain: () => uncertain }).find(p => p.stopId === stop.stopId) : undefined;
  // Two labelled groups (CIV-946): vehicles against their timetable, then a rider's wait against the scheduled gaps.
  return [...(heat ? [{ heading: measureLabel('delayStarts'), lines: [`${DELAY_STAYS} ${mins(heat.addedMin)}`, ...segmentLines(v3.bands[band] as DashboardBandData, dir, heat.fromStopId, stop.stopId)] }] : []), ...stopCardGroups(stop, extra ? extra.extraWaitMin : null)];
}

/** The lines of a segment's card: only the segment, never its start stop. */
function segmentLines(data: DashboardBandData, dir: number, fromStopId: string, toStopId: string): string[] {
  const x = data.buildup.find(b => b.directionId === dir)?.stretches.find(t => t.fromStopId === fromStopId && t.toStopId === toStopId);
  return x && x.n > 0 ? [`Typical added ${mins(x.medianAddedMin)}`, `Trips where it grows ${pct(x.growShare)} of ${x.n.toLocaleString()}`] : [];
}

/** Delay starts: a segment card's "Added and kept" line, the figure the map, list and panel use, when the segment ends at a measured stop. */
function keptLine(v3: LiveV3, band: DashboardBand, dir: number, toStopId: string, fromStopId: string, uncertain: readonly UncertainStart[]): string[] {
  const p = delayHeatPoints(new Map([['', v3]]), band, { only: { route: '', directionId: dir }, uncertain: () => uncertain }).find(x => x.stopId === toStopId && x.fromStopId === fromStopId);
  return p ? [`${DELAY_STAYS} ${mins(p.addedMin)}`] : [];
}

/** The compact card shown on the map at the picked stop or segment. */
function MapCard({ title, lines = [], groups = [] }: { title: string; lines?: string[]; /** Labelled groups of lines (the stop card). */ groups?: CardGroup[] }) {
  return (
    <div className="space-y-0.5 p-3 text-xs">
      <div className="text-sm font-bold leading-snug">{title}</div>
      {lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
      {groups.map((g, i) => (
        <div key={g.heading ?? i} className="pt-1.5">
          {g.heading && <div className="font-bold text-[var(--text-muted)]">{g.heading}</div>}
          {g.lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
        </div>
      ))}
    </div>
  );
}

const PANEL_PAD = { top: 56, bottom: 24, left: 410, right: 24 };
// On a phone the measure pills take two rows, so the route and the stop card start below them.
const NARROW_PAD = { top: 76, bottom: 24, left: 24, right: 24 };
/** What the route's week figures cover (the Run time tile's own scope wording). */
const BOTH_DIRECTIONS = 'both directions';
/**
 * A picked route's week figures. Run time is its main pattern's alone (CIV-945: short turns and branches no longer blur
 * it; each has its own row in the Run time card), where the file has it.
 */
// Run time is already the main pattern's (fetchLiveDashboard, #1149).
const weekly = (v3: LiveV3) => (v3.weekly ? kpiTiles(v3.weekly, weekDailyValues(v3)) : []);

/** Under the left panel's tiles; the full rule is its hover text. */
const NOISE_CAPTION = 'Grey = within normal day-to-day change';
/** The network's summary, on the left with no route picked: the week's figures as one-line rows, (late departures by hour show for a picked route only). */
function summaryWidgets(s: AgencySummary, band: DashboardBand): PanelWidget[] {
  const thisLeft = s.weekly ? leftOutDates(s.weekly.thisWeek) : [], lastLeft = s.weekly ? leftOutDates(s.weekly.lastWeek) : [];
  const weekLeft = { text: excludingWeeksText(thisLeft, lastLeft), title: leftOutReason([...lastLeft, ...thisLeft]) };
  const tiles = agencyKpiTiles(s);
  return [
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope="All routes" caption={NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
  ];
}


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
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope={`${route} · ${BOTH_DIRECTIONS}`} caption={NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
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
function Body({ agency, pickSlot, s, route, setRoute, dir, setDir, dirSlot, routeSlot, dataSlot, band, measure, setMeasure, pick, setPick }: {
  agency: string; pickSlot: HTMLElement | null; dirSlot: HTMLElement | null; routeSlot: HTMLElement | null; dataSlot: HTMLElement | null; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; setMeasure: (m: MapMeasure) => void; pick: MapPick | null; setPick: (p: MapPick | null) => void;
}) {
  const wide = useMediaQuery('(min-width: 1024px)');
  // On a phone the map sits above the widgets: a stop or stretch picked lower down (a "Stops most often late" row)
  // brings the map back into view so its card shows (#1151).
  const narrowScroll = useRef<HTMLDivElement | null>(null);
  const pickKey = pick ? (pick.kind === 'stop' ? pick.stopId : `${pick.fromStopId}>${pick.toStopId}`) : null;
  useEffect(() => { if (!wide && pickKey) narrowScroll.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [pickKey, wide]);
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
    ? pick?.kind === 'segment' ? <MapCard title={stretchLabel(stops.get(pick.fromStopId)?.name ?? pick.fromStopId, stops.get(pick.toStopId)?.name ?? pick.toStopId)} lines={[...(measure === 'delayStarts' ? keptLine(v3, band, shown, pick.toStopId, pick.fromStopId, uncertain) : []), ...segmentLines(bandData, shown, pick.fromStopId, pick.toStopId)]} />
      : picked ? <MapCard title={picked.name} groups={stopLines(v3, band, shown, picked, measure, uncertain)} /> : null
    : null;
  const summary = useMemo(() => summaryWidgets(s, band), [s, band]);
  const backToNetwork = () => { setRoute(null); setDir(null); setPick(null); };
  // One panel, on the left: the network's overview with no route picked; the route's own figures once one is picked, with a way back.
  const back: PanelWidget = { key: 'back', size: 'medium', node: <button type="button" onClick={backToNetwork} className="-my-[13px] py-[13px] pr-4 text-left text-sm font-bold text-[var(--text-primary)] hover:underline">← {agency.toUpperCase()}</button> };
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
    <div ref={setNoteEl} className="pointer-events-none absolute bottom-0 left-0 right-12 flex flex-col items-end gap-2">
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
  // One pill showing the current direction; a click switches to the other.
  const direction = ids.length > 1 && dirSlot ? createPortal(<Pill size="segment" selected className={PHONE_TAP_AREA} aria-label="Direction" onClick={() => { setDir(ids[(ids.indexOf(shown) + 1) % ids.length]); setPick(null); }}>{v3!.directionLabels[String(shown)]}</Pill>, dirSlot) : null;
  // The picked route's name, in the top bar beside the direction pills (the name the route page's title uses).
  // The route menu at the right end of the top bar: the panel list's routes in its order, plus All routes; a pick sets route= as a list click does.
  const routeOptions = useMemo(() => [['', 'All routes'] as const, ...rankRoutes(s, networkV3, measure, band).map(({ r }) => [r.route, `${r.route} ${r.longName ?? ''}`.trim()] as const)], [s, networkV3, measure, band]);
  const routeMenu = pickSlot ? createPortal(<PillMenu label="Route" alignRight value={route ?? ''} options={routeOptions} onPick={r => { if (r) { setRoute(r); setPick(null); } else { setRoute(null); setDir(null); setPick(null); } }} />, pickSlot) : null;
  // The newest day in the figures, in the header: the picked route's, or the network summary's week.
  const upTo = dataSlot ? createPortal(<DataUpTo dates={v3 ? v3.window.dates : route ? [] : s.weekly?.thisWeek.dates ?? []} route={v3 ? ready?.route : ''} />, dataSlot) : null;
  if (!wide) {
    // Narrow screens: the map on top, the widgets under it; the page scrolls, no panel does.
    return (
      <div className="relative min-h-0 flex-1">
        {direction}{upTo}{routeMenu}
        <div ref={narrowScroll} className="absolute inset-0 overflow-y-auto">
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
      {direction}{upTo}{routeMenu}
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
  const [pickSlot, setPickSlot] = useState<HTMLElement | null>(null);
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
        <button type="button" onClick={() => { setRoute(null); setDir(null); setPick(null); }} className="text-sm font-bold hover:underline">{agency.toUpperCase()}</button>
        <div ref={setRouteSlot} className="contents" />
        <div ref={setDirSlot} className="contents" />
        <div ref={setDataSlot} className="contents" />
        {/* Time of day at the right end of the top bar (Ryan, 2026-10-26). */}
        <div className="ml-auto flex items-center gap-2"><div ref={setPickSlot} className="contents" /><PeriodMenu band={band} setBand={setBand} /></div>
      </header>
      <Body agency={agency} pickSlot={pickSlot} dirSlot={dirSlot} routeSlot={routeSlot} dataSlot={dataSlot} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} setMeasure={setMeasure} pick={pick} setPick={setPick} />
    </>,
  );
}
