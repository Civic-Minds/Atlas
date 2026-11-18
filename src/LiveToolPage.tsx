import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadingText, ATLAS_BYLINE, LOADING_LABEL, MEASURE_LABEL, ROUTE_MENU_LABEL, ALL_ROUTES_LABEL, LIVE_NOISE_CAPTION, MAP_COLOURS_LABEL } from './content/noticeCopy';
import RouteRowName from './components/RouteRowName';
import { routeLabels } from './utils/format';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { FEATURES } from '../shared/config';

import type { AgencySummary } from '../shared/liveAgency';
import { NOISE_RULE, weekDailyValues, weekForBand, type UncertainStart, type DashboardBand, type DashboardBandData, type LiveV3 } from '../shared/liveDashboard';
import { liveAgencyPath, useLiveDashboard } from './hooks/useLiveDashboard';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_TOOL_URL, currentSearch, linkUpdate, readLink } from './utils/urlSchema';
import { stretchLabel } from './utils/stopLabel';
import { agencyKpiTiles } from './utils/liveAgencyKpi';
import { excludingDays, kpiTiles } from './utils/liveKpi';
import { DIRECTION_LABEL, GROWS_LABEL, LATE_STOPS_TITLE, TIME_OF_DAY_LABEL, excludingText } from '../shared/liveWording';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasLogo from './components/AtlasLogo';
import { MapAppShell, MapAppHeader, MapAppLayout, MapAppMap, MapAppFooter, MapPillGroup, PillMenu, MAP_APP_PADDING, framePadding, useMapAppWide, type MapPick } from './components/MapApp';
import { MapLegendCard } from './components/ui/MapLegendCard';
import { directionStopsById } from './components/Live/DirectionStrip';
import { TYPICAL_ADDED, timeLostLine } from '../shared/liveWording';
import { DELAY_STARTS_LABEL, MEASURES, measureLabel, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from './components/Live/routeMapModel';
import { delayHeatPoints } from './components/Live/delayHeatModel';
import { stopCardGroups, type CardGroup } from './components/Live/stopCardModel';
import { MapCard } from './components/Live/MapCard';
import { type RouteStripStop } from './components/Live/routeStripModel';
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
import { PERIOD_BANDS_ONLY, mins } from './components/Live/sections/figures';
import { liveBandNow } from './components/Live/liveBandNow';
import { useAgencies } from './hooks/useAgencies';
import Pill from './components/ui/Pill';
import LiveMapKey from './components/Live/LiveMapKey';
import LiveBackLink from './components/Live/LiveBackLink';
import { CardBackLink } from './components/CardBack';
import { PHONE_TAP_AREA } from './styles';
import { DataUpTo, withNiceNames } from './LiveRoutePage';
import { percentText, countText } from '../shared/numberText';
import { STUDIO_LIVE_PENDING } from '../shared/liveWording';
import { rankedTimeLoss, timeLossBySegment, timeLossReport, type TimeLossListRow, type TimeLossReport } from './utils/timeLossReport';
import { useTimeLossData } from './components/Live/tool/useTimeLossReports';
import FallsBehindWidget from './components/Live/tool/FallsBehindWidget';



/** The measures, in the top bar with the other switchers (CIV-1732, Ryan's option A). "Delays start" (the CIV-942 heatmap) is one of the set. */
export const MAP_MEASURES: ReadonlyArray<readonly [MapMeasure, string]> = [...MEASURES, ['delayStarts', DELAY_STARTS_LABEL]];
/** CIV-1828: Studio's Live page leads with "Falls behind" (where vehicles fall behind the schedule, stop to stop). */
export const STUDIO_MAP_MEASURES: ReadonlyArray<readonly [MapMeasure, string]> = [['fallsBehind', STUDIO_LIVE_PENDING.fallsBehindPill], ...MAP_MEASURES];
/** How many stop pairs the "Falls behind" lists show. */
const FALLS_BEHIND_ROWS = 10;
function MeasurePills({ measure, setMeasure, options = MAP_MEASURES }: { measure: MapMeasure; setMeasure: (m: MapMeasure) => void; options?: ReadonlyArray<readonly [MapMeasure, string]> }) {
  return <MapPillGroup label={MEASURE_LABEL} options={options} value={measure} onChange={setMeasure} />;
}

/** The time of day as one pill showing the current period; a click opens a small menu with the five choices. */
export function PeriodMenu({ band, setBand }: { band: DashboardBand; setBand: (b: DashboardBand) => void }) {
  return <PillMenu label={TIME_OF_DAY_LABEL} value={band} options={PERIOD_BANDS_ONLY} onPick={k => setBand(k as DashboardBand)} />;
}


/** The lines of a stop's card: the trimmed figures the strip's hover shows, then its extra wait where it has one. */
function stopLines(v3: LiveV3, band: DashboardBand, dir: number, stop: RouteStripStop, measure: MapMeasure, uncertain: readonly UncertainStart[]): CardGroup[] {
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === dir && x.stopId === stop.stopId);
  // Delay starts: the figure the map colours by, then the stretch into this stop in the segment card's own words. Only for
  // a stop the map measures (never a terminal stretch or one with too few trips).
  const heat = measure === 'delayStarts' ? delayHeatPoints(new Map([['', v3]]), band, { only: { route: '', directionId: dir }, uncertain: () => uncertain }).find(p => p.stopId === stop.stopId) : undefined;
  // Two labelled groups (CIV-946): vehicles against their timetable, then a rider's wait against the scheduled gaps.
  return [...(heat ? [{ heading: measureLabel('delayStarts'), lines: [timeLostLine(heat.addedMin), ...segmentLines(v3.bands[band] as DashboardBandData, dir, heat.fromStopId, stop.stopId)] }] : []), ...stopCardGroups(stop, extra ? extra.extraWaitMin : null)];
}

/** The lines of a segment's card: only the segment, never its start stop. */
function segmentLines(data: DashboardBandData, dir: number, fromStopId: string, toStopId: string): string[] {
  const x = data.buildup.find(b => b.directionId === dir)?.stretches.find(t => t.fromStopId === fromStopId && t.toStopId === toStopId);
  return x && x.n > 0 ? [`${TYPICAL_ADDED} ${mins(x.medianAddedMin)}`, `${GROWS_LABEL} ${percentText(x.growShare)} of ${countText(x.n)}`] : [];
}

/** Delay starts: a segment card's "Time lost" line, the figure the map, list and panel use, when the segment ends at a measured stop. */
function keptLine(v3: LiveV3, band: DashboardBand, dir: number, toStopId: string, fromStopId: string, uncertain: readonly UncertainStart[]): string[] {
  const p = delayHeatPoints(new Map([['', v3]]), band, { only: { route: '', directionId: dir }, uncertain: () => uncertain }).find(x => x.stopId === toStopId && x.fromStopId === fromStopId);
  return p ? [timeLostLine(p.addedMin)] : [];
}

/** CIV-1828: a stop pair's card lines under "Falls behind": the report's wording for its row, nothing when it is not listed. */
function fallsBehindLines(report: TimeLossReport | undefined, band: DashboardBand, dir: number, from: string, to: string): string[] {
  const d = report?.bands[band]?.find(x => x.directionId === dir);
  const W = STUDIO_LIVE_PENDING;
  const slow = d?.slower.find(r => r.fromStopId === from && r.toStopId === to);
  if (slow) return [W.takesLonger(slow.typicalMin), ...(slow.showP90 ? [W.oneInTen(slow.p90MinDown)] : []), W.sample(slow.passes, slow.days)];
  const loose = d?.looser.find(r => r.fromStopId === from && r.toStopId === to);
  return loose ? [W.looserLine(-loose.typicalMin), W.sample(loose.passes, loose.days)] : [];
}

/** What the route's week figures cover (the Run time tile's own scope wording). */
const BOTH_DIRECTIONS = 'both directions';
/**
 * A picked route's week figures. Run time is its main pattern's alone (CIV-945: short turns and branches no longer blur
 * it; each has its own row in the Run time card), where the file has it.
 */
// Run time is already the main pattern's (fetchLiveDashboard, #1149).
// CIV-1459: the picked time of day's two weeks; none when the file has no figures for it (never the whole day's in their place).
const weekly = (v3: LiveV3, band: DashboardBand) => { const w = weekForBand(v3.weekly, band); return w ? kpiTiles(w, band === 'all' ? weekDailyValues(v3) : {}) : []; };

/** The network's summary, on the left with no route picked: the week's figures as one-line rows, (late departures by hour show for a picked route only). */
function summaryWidgets(s: AgencySummary, band: DashboardBand): PanelWidget[] {
  const weekLeft = excludingDays(s.weekly);
  const tiles = agencyKpiTiles(s, band);
  return [
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope={ALL_ROUTES_LABEL} caption={LIVE_NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
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
  const tiles = weekly(v3, band);
  const weekLeft = excludingDays(v3.weekly);
  // #1490: the panel names the left-out days once; late by hour adds its own note only when its days differ from the week table's.
  const hourLeft = routeLeftOut(v3);
  const hourLeftShown = excludingText(hourLeft) === weekLeft.text ? undefined : hourLeft;
  return [
    // The week's figures cover the whole route (both directions), while Run time and the stops follow the direction pills.
    ...(tiles.length ? [{ key: 'week', size: 'medium' as const, node: <WeekTable tiles={tiles} scope={`${route} · ${BOTH_DIRECTIONS}`} caption={LIVE_NOISE_CAPTION} captionTitle={NOISE_RULE} excluding={weekLeft.text} excludingTitle={weekLeft.title ?? undefined} /> }] : []),
    ...(hasRunTime ? [{ key: 'run-time', size: 'medium' as const, node: <RunTimeWidget v3={v3} dir={dir} band={band} /> }] : []),
    ...(hours.length ? [{ key: 'late-hours', size: 'medium' as const, node: <LateByHourSection chart="mini" hours={hours} band={band} overall={routeLateOverall(v3)} days={routeLateDays(v3)} leftOut={hourLeftShown} scope={BOTH_DIRECTIONS} height={40} /> }] : []),
    ...(worst.length ? [{ key: 'problems', size: 'medium' as const, node: <ProblemsWidget title={LATE_STOPS_TITLE} rows={worst} /> }] : []),
  ];
}

/** The panel while a picked route's figures are on their way: the page's own word and soft grey blocks where the figures will be. */
function LoadingWidget() {
  return (
    <Widget title={LOADING_LABEL} size="medium">
      <div aria-busy="true" className="flex flex-col gap-3">
        {[40, 72, 56].map(h => <div key={h} className="rounded-lg bg-[var(--bg-btn-hover)]" style={{ height: h }} />)}
      </div>
    </Widget>
  );
}

/**
 * The whole screen under the top bar: the map always, the overview on the left, the widgets on the right. Also the body
 * of Studio's Live page (CIV-1828), which passes its own measures (STUDIO_MAP_MEASURES, "Falls behind" first).
 */
export function Body({ agency, agencyName, pickSlot, measureSlot, s, route, setRoute, dir, setDir, dirSlot, dataSlot, band, measure, setMeasure, pick, setPick, measures }: {
  agency: string; /** The agency's short name, for the back link. */ agencyName: string; pickSlot: HTMLElement | null; measureSlot: HTMLElement | null; dirSlot: HTMLElement | null; dataSlot: HTMLElement | null; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; setMeasure: (m: MapMeasure) => void; pick: MapPick | null; setPick: (p: MapPick | null) => void;
  /** The measure pills, in order (default: the Live tool's). */ measures?: ReadonlyArray<readonly [MapMeasure, string]>;
}) {
  const wide = useMapAppWide();
  // On a phone the map sits above the widgets: a stop or stretch picked lower down (a "Stops most often late" row)
  // brings the map back into view so its card shows (#1151).
  const narrowScroll = useRef<HTMLDivElement | null>(null);
  const pickKey = pick ? (pick.kind === 'stop' ? pick.stopId : pick.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : pick.id) : null;
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
  // CIV-1828 "Falls behind": every route's stop pairs (the time-loss report), loaded only for that measure.
  const fallsBehind = measure === 'fallsBehind';
  const lossData = useTimeLossData(agency, routes, fallsBehind);
  const lossReports = useMemo(() => new Map<string, TimeLossReport>([...lossData].map(([r, d]) => [r, timeLossReport(d, [band])])), [lossData, band]);
  const ids = v3 ? Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b) : [];
  const shown = v3 ? (dir != null && ids.includes(dir) ? dir : ids[0]) : 0;
  const uncertain = ready?.uncertainStart ?? [];
  const stops = useMemo(() => (v3 ? directionStopsById(v3, shown, band, uncertain) : new Map<string, RouteStripStop>()), [v3, shown, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const model: RouteMapModel = useMemo(() => {
    const loss = (r: string, d: number) => { const x = lossData.get(r); return x ? timeLossBySegment(x, band, d) : undefined; };
    if (v3) return routeMapModel(v3, shown, band, measure, uncertain, route ? loss(route, shown) : undefined);
    const segments: MapSegment[] = [];
    for (const [r, nb] of network) {
      const n3 = nb.v3;
      const dirs = Object.keys(n3.directionLabels).map(Number).sort((a, b) => a - b);
      dirs.forEach((d, k) => { for (const seg of routeMapModel(n3, d, band, measure, [], loss(r, d)).segments) segments.push({ ...seg, route: r, label: r, offset: dirs.length > 1 ? (k === 0 ? 2.5 : -2.5) : 0 }); });
    }
    return { directionId: 0, segments, stops: [] };
  }, [v3, shown, band, measure, network, lossData]); // eslint-disable-line react-hooks/exhaustive-deps
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
    ? pick?.kind === 'segment' ? <MapCard title={stretchLabel(stops.get(pick.fromStopId)?.name ?? pick.fromStopId, stops.get(pick.toStopId)?.name ?? pick.toStopId)} lines={fallsBehind ? fallsBehindLines(route ? lossReports.get(route) : undefined, band, shown, pick.fromStopId, pick.toStopId) : [...(measure === 'delayStarts' ? keptLine(v3, band, shown, pick.toStopId, pick.fromStopId, uncertain) : []), ...segmentLines(bandData, shown, pick.fromStopId, pick.toStopId)]} />
      : picked ? <MapCard title={picked.name} groups={stopLines(v3, band, shown, picked, measure, uncertain)} /> : null
    : null;
  const summary = useMemo(() => summaryWidgets(s, band), [s, band]);
  // CIV-1828: a "Falls behind" row opens its route, direction and stop pair.
  const openLossRow = (x: TimeLossListRow) => { setRoute(x.route); setDir(x.directionId); setPick({ kind: 'segment', fromStopId: x.row.fromStopId, toStopId: x.row.toStopId }); };
  const lossDates = (r?: string) => { const ds = r ? lossData.get(r)?.dates : [...lossData.values()].flatMap(d => d.dates); return [...new Set(ds ?? [])].sort(); };
  const networkLoss = fallsBehind && !route ? rankedTimeLoss(lossReports, band, FALLS_BEHIND_ROWS) : null;
  const routeLoss = fallsBehind && route && lossReports.has(route) ? rankedTimeLoss(new Map([[route, lossReports.get(route)!]]), band, FALLS_BEHIND_ROWS) : null;
  const networkLossWidget: PanelWidget | null = networkLoss ? { key: 'falls-behind', size: 'medium', node: <FallsBehindWidget title={STUDIO_LIVE_PENDING.fallsBehindAll} slower={networkLoss.slower} looser={networkLoss.looser} showRoute dates={lossDates()} onPick={openLossRow} /> } : null;
  const routeLossWidget: PanelWidget | null = routeLoss && route ? { key: 'falls-behind', size: 'medium', node: <FallsBehindWidget title={STUDIO_LIVE_PENDING.fallsBehindRoute(route)} slower={routeLoss.slower} looser={routeLoss.looser} showRoute={false} dates={lossDates(route)} onPick={openLossRow} /> } : null;
  const backToNetwork = () => { setRoute(null); setDir(null); setPick(null); };
  // One panel, on the left: the network's overview with no route picked; the route's own figures once one is picked, with a way back.
  // CIV-1821: the main map's way back from a route (CardBackLink: small and muted, not a big link over the map).
  const back: PanelWidget = { key: 'back', size: 'medium', node: <CardBackLink onClick={backToNetwork}>{agencyName}</CardBackLink> };
  const routePanel: PanelWidget[] | null = !route ? null
    : v3 && ready ? [back, ...(routeLossWidget ? [routeLossWidget] : []), ...routeWidgets({ data: ready, v3, dir: shown, band, setPick, route: ready.route })]
    : [back, ...(own.kind === 'loading' ? [{ key: 'loading', size: 'medium' as const, node: <LoadingWidget /> }] : [])];
  // The map note sits over the map's bottom edge: the route is framed above it (its measured height plus its inset and a gap).
  const [noteH, setNoteH] = useState(0);
  // The note is about delay at the first stops: it shows in the delay-based views (Late, Run time), not for the gap-based ones (Extra wait, Bunching).
  const showNote = ready?.note && (measure === 'late' || measure === 'runTime' || measure === 'delayStarts');
  // The bottom of the map: the note (when it applies) above the key's row of pills. The route is framed above both.
  const note = <MapAppFooter note={showNote ? ready!.note : undefined}  onHeight={setNoteH} />;
  const mapEl = (
    <MapAppMap
      layer={{ kind: 'segments', model, measure, heat }} selected={pick} anchor={anchor} card={card} padding={framePadding(wide ? MAP_APP_PADDING.wide : MAP_APP_PADDING.narrow, noteH)}
      onPick={p => { if (!route && p?.kind === 'segment' && p.route) setRoute(p.route); else setPick(p); }}
      frameKey={ready && route ? `route-${ready.route}-${noteH}` : `network-${network.size === routes.length ? 'all' : 'loading'}`}
    />
  );
  // The direction switch sits in the top bar with the other pills.
  // One pill showing the current direction; a click switches to the other.
  const direction = ids.length > 1 && dirSlot ? createPortal(<Pill size="segment" selected className={PHONE_TAP_AREA} aria-label={DIRECTION_LABEL} onClick={() => { setDir(ids[(ids.indexOf(shown) + 1) % ids.length]); setPick(null); }}>{v3!.directionLabels[String(shown)]}</Pill>, dirSlot) : null;
  // The picked route's name, in the top bar beside the direction pills (the name the route page's title uses).
  // The route menu at the right end of the top bar: the panel list's routes in its order, plus All routes; a pick sets route= as a list click does.
  // Each route as the list rows show it: the number in bold, the name regular, no dash (Ryan, CIV-1117 row 5).
  const routeOptions = useMemo(() => [['', ALL_ROUTES_LABEL] as const, ...rankRoutes(s, networkV3, measure, band).map(({ r }) => {
    const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency });
    return [r.route, <RouteRowName key={r.route} shortName={l.primary} name={l.secondary} />, l.text] as const;
  })], [s, networkV3, measure, band]);
  const routeMenu = pickSlot ? createPortal(<PillMenu label={ROUTE_MENU_LABEL} alignRight active={!!route} value={route ?? ''} options={routeOptions} onPick={r => { if (r) { setRoute(r); setPick(null); } else { setRoute(null); setDir(null); setPick(null); } }} />, pickSlot) : null;
  // The newest day in the figures, in the header: the picked route's, or the network summary's week.
  const upTo = dataSlot ? createPortal(<DataUpTo dates={v3 ? v3.window.dates : route ? [] : s.weekly?.thisWeek.dates ?? []} route={v3 ? ready?.route : ''} />, dataSlot) : null;
  const overview = <OverviewList s={s} measure={measure} band={band} route={route} network={networkV3} onPick={r => { setRoute(r); setPick(null); }} />;
  // The measures sit in the top bar with the other switchers; the map key sits in the regular map's key card and slot (CIV-1821).
  const measureBar = measureSlot ? createPortal(<MeasurePills measure={measure} setMeasure={setMeasure} options={measures} />, measureSlot) : null;
  const mapOverlay = <><MapLegendCard label={MAP_COLOURS_LABEL}><LiveMapKey measure={measure} variant="card" /></MapLegendCard>{note}</>;
  // Narrow screens: the map on top, the widgets under it; the page scrolls, no panel does.
  return (
    <MapAppLayout
      wide={wide}
      portals={<>{direction}{upTo}{routeMenu}{measureBar}</>}
      narrowScrollRef={narrowScroll}
      map={mapEl}
      overlay={mapOverlay}
      sidebar={routePanel ? <WidgetPanel widgets={routePanel} /> : networkLossWidget ? <WidgetPanel widgets={[networkLossWidget, ...summary]} /> : <><WidgetPanel widgets={summary} />{overview}</>}
      narrowPanels={<>
        <WidgetPanel className="p-3" widgets={routePanel ?? (networkLossWidget ? [networkLossWidget, ...summary] : summary)} />
        {!routePanel && !networkLossWidget && <div className="flex p-3 pt-0">{overview}</div>}
      </>}
    />
  );
}

/** The Live planner: the map always, the agency overview on the left, widgets that follow the selection on the right. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const agencyName = useLiveAgencyName(agency);
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [link] = useState(() => readLink(currentSearch(), LIVE_TOOL_URL));
  const [route, setRoute] = useState<string | null>(() => link.route ?? null);
  const [dir, setDir] = useState<number | null>(() => link.dir ?? null);
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => link.band ?? liveBandNow(agencies.find(a => a.slug === agency)?.timezone));
  const [measure, setMeasure] = useState<MapMeasure>(() => link.measure ?? 'late');
  const [dirSlot, setDirSlot] = useState<HTMLElement | null>(null);
  const [dataSlot, setDataSlot] = useState<HTMLElement | null>(null);
  const [pickSlot, setPickSlot] = useState<HTMLElement | null>(null);
  const [measureSlot, setMeasureSlot] = useState<HTMLElement | null>(null);
  const [pick, setPick] = useState<MapPick | null>(() => {
    if (link.stop) return { kind: 'stop', stopId: link.stop };
    const [f, t] = (link.segment ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  useEffect(() => {
    syncUrlParams(linkUpdate(LIVE_TOOL_URL, {
      view: null, tab: null, route, dir, band, measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, segment: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    }));
  }, [route, dir, band, measure, pick]);
  useEffect(() => { applySeoToDocument(document, { title: liveReportTitle(agencyName), description: '', canonicalUrl: window.location.href, noindex: true, matchedPath: window.location.pathname }); }, [agencyName]);
  if (!FEATURES.liveReports) return <LiveOffNotice report />;
  const shell = (body: ReactNode) => <MapAppShell>{body}</MapAppShell>;
  // CIV-1413 C: a page without figures keeps the top bar's Atlas logo and the "← agency" link every Live page has in all states (CIV-1446).
  const bare = (line: ReactNode, busy = false) => shell(
    <>
      <MapAppHeader><AtlasLogo href="/" ariaLabel={ATLAS_BYLINE} showMark={false} /></MapAppHeader>
      <div className="p-6">
        <LiveBackLink agencyName={agencyName} href={liveAgencyPath(agency)} />
        <p className="mt-3 text-sm text-[var(--text-muted)]" aria-busy={busy || undefined}>{line}</p>
      </div>
    </>,
  );
  if (state.kind === 'loading') return bare(loadingText(agencyName), true);
  if (state.kind === 'error') return bare(state.reason);
  if (state.data.status !== 'ready') return bare(state.data.status === 'no_analysis' ? devOnly(state.data.reason) : state.data.reason);
  const s = state.data.summary;
  return shell(
    <>
      <MapAppHeader>
        <AtlasLogo href="/" ariaLabel={ATLAS_BYLINE} showMark={false} />
        <button type="button" onClick={() => { setRoute(null); setDir(null); setPick(null); }} className="text-sm font-bold hover:underline">{agencyName}</button>
        <div ref={setDirSlot} className="contents" />
        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--border-primary)]" />
        <div ref={setMeasureSlot} className="contents" />
        {/* The data date, the route menu and the time of day at the right end of the top bar (Ryan, 2026-10-26). */}
        <div className="ml-auto flex items-center gap-3"><div ref={setDataSlot} className="contents" /><div ref={setPickSlot} className="contents" /><PeriodMenu band={band} setBand={setBand} /></div>
      </MapAppHeader>
      <Body agency={agency} agencyName={agencyName} pickSlot={pickSlot} measureSlot={measureSlot} dirSlot={dirSlot} dataSlot={dataSlot} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} setMeasure={setMeasure} pick={pick} setPick={setPick} />
    </>,
  );
}
