import { useMemo, useRef, type ReactNode } from 'react';
import { LOADING_LABEL, ALL_ROUTES_LABEL, LIVE_NOISE_CAPTION } from '../../../content/noticeCopy';
import RouteRowName from '../../RouteRowName';
import { routeLabels } from '../../../utils/format';
import type { AgencySummary } from '../../../../shared/liveAgency';
import { NOISE_RULE, weekDailyValues, weekForBand, type UncertainStart, type DashboardBand, type DashboardBandData, type LiveV3 } from '../../../../shared/liveDashboard';
import { useLiveDashboard } from '../../../hooks/useLiveDashboard';
import { excludingDays, kpiTiles } from '../../../utils/liveKpi';
import { agencyKpiTiles } from '../../../utils/liveAgencyKpi';
import { stretchLabel } from '../../../utils/stopLabel';
import { TYPICAL_ADDED, GROWS_LABEL, LATE_STOPS_TITLE, excludingText, timeLostLine, STUDIO_LIVE_PENDING } from '../../../../shared/liveWording';
import { measureLabel, routeMapModel, type MapMeasure, type MapSegment, type RouteMapModel } from '../routeMapModel';
import { delayHeatPoints } from '../delayHeatModel';
import { stopCardGroups, type CardGroup } from '../stopCardModel';
import { MapCard } from '../MapCard';
import { directionStopsById } from '../DirectionStrip';
import { type RouteStripStop } from '../routeStripModel';
import Widget from './Widget';
import { type PanelWidget } from './WidgetPanel';
import OverviewList from './OverviewList';
import { rankRoutes } from '../overviewListModel';
import LateByHourSection, { routeLateDays, routeLeftOut, routeLateHours, routeLateOverall } from '../sections/LateByHourSection';
import ProblemsWidget from './ProblemsWidget';
import { worstStopRows } from '../sections/WorstStopsSection';
import RunTimeWidget from './RunTimeWidget';
import useNetworkData, { type ReadyRoute } from './useNetworkData';
import { WeekTable } from '../../../LiveDashboardView';
import { mins } from '../sections/figures';
import { CardBackLink } from '../../CardBack';
import { withNiceNames } from '../../../LiveRoutePage';
import { percentText, countText } from '../../../../shared/numberText';
import { rankedTimeLoss, timeLossBySegment, timeLossReport, type TimeLossListRow, type TimeLossReport } from '../../../utils/timeLossReport';
import { useTimeLossData } from './useTimeLossReports';
import FallsBehindWidget from './FallsBehindWidget';
import type { MapPick } from '../../MapApp';

/**
 * Live's page logic, one source for both frames (CIV-1828): the Live tool page's own (LiveToolPage's Body) and Studio's
 * Live page on the main map's frame. It owns what the screen derives from the picks: the data, the map's model and
 * card, the sidebar's widgets, the route menu's options. The frames own where each goes.
 */

/** How many stop pairs the "Falls behind" lists show. */
export const FALLS_BEHIND_ROWS = 10;

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


export interface LiveBodyInput {
  agency: string; agencyName: string; s: AgencySummary;
  route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void;
  band: DashboardBand; measure: MapMeasure; pick: MapPick | null; setPick: (p: MapPick | null) => void;
}

export interface LiveBodyModel {
  routes: string[];
  /** The picked route's loaded figures (the previous route's until the new one's arrive), or null. */
  ready: ReadyRoute | null;
  v3: LiveV3 | null;
  /** The route's directions, in order, and the one shown. */
  ids: number[];
  shown: number;
  model: RouteMapModel;
  heat: ReturnType<typeof delayHeatPoints> | null;
  anchor: [number, number] | null;
  card: ReactNode;
  /** The sidebar: a route's widgets (with the way back first), or null with no route picked. */
  routePanel: PanelWidget[] | null;
  /** The same without the way back, for a frame with its own (the main map's card header). */
  routeBody: PanelWidget[] | null;
  /** "Falls behind" with no route picked: its list, then the summary. */
  networkLossWidget: PanelWidget | null;
  summary: PanelWidget[];
  overview: ReactNode;
  /** The route menu's choices: All routes, then the panel list's routes in its order. */
  routeOptions: ReadonlyArray<readonly [string, ReactNode] | readonly [string, ReactNode, string]>;
  /** The days the data covers (the picked route's, or the network summary's week) and the route they are for. */
  dataDates: readonly string[];
  dataRoute: string;
  /** The map's note, for the delay-based measures; undefined otherwise. */
  note: ReactNode | undefined;
  /** What the map's frame is keyed on: a new one frames what is drawn. */
  frameKey: string;
  /** A click on the map: with no route picked, a segment opens its route; otherwise it is the pick. */
  onMapPick: (p: MapPick | null) => void;
  loadingRoute: boolean;
  backToNetwork: () => void;
  /** A row of a ranked list opens its route. */
  openRoute: (r: string) => void;
}

export function useLiveBody({ agency, agencyName, s, route, setRoute, dir, setDir, band, measure, pick, setPick }: LiveBodyInput): LiveBodyModel {
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
  // Memoised: a frame that hands the card to a context (Studio's page overlay) must not see a new one every render.
  const card = useMemo(() => v3 && bandData
    ? pick?.kind === 'segment' ? <MapCard title={stretchLabel(stops.get(pick.fromStopId)?.name ?? pick.fromStopId, stops.get(pick.toStopId)?.name ?? pick.toStopId)} lines={fallsBehind ? fallsBehindLines(route ? lossReports.get(route) : undefined, band, shown, pick.fromStopId, pick.toStopId) : [...(measure === 'delayStarts' ? keptLine(v3, band, shown, pick.toStopId, pick.fromStopId, uncertain) : []), ...segmentLines(bandData, shown, pick.fromStopId, pick.toStopId)]} />
      : picked ? <MapCard title={picked.name} groups={stopLines(v3, band, shown, picked, measure, uncertain)} /> : null
    : null, [v3, bandData, pick, picked, stops, band, shown, measure, uncertain, fallsBehind, route, lossReports]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summaryWidgets(s, band), [s, band]);
  // CIV-1828: a "Falls behind" row opens its route, direction and stop pair.
  const openLossRow = (x: TimeLossListRow) => { setRoute(x.route); setDir(x.directionId); setPick({ kind: 'segment', fromStopId: x.row.fromStopId, toStopId: x.row.toStopId }); };
  const lossDates = (r?: string) => { const ds = r ? lossData.get(r)?.dates : [...lossData.values()].flatMap(d => d.dates); return [...new Set(ds ?? [])].sort(); };
  const networkLoss = fallsBehind && !route ? rankedTimeLoss(lossReports, band, FALLS_BEHIND_ROWS) : null;
  const routeLoss = fallsBehind && route && lossReports.has(route) ? rankedTimeLoss(new Map([[route, lossReports.get(route)!]]), band, FALLS_BEHIND_ROWS) : null;
  const networkLossWidget: PanelWidget | null = networkLoss ? { key: 'falls-behind', size: 'medium', node: <FallsBehindWidget label={STUDIO_LIVE_PENDING.fallsBehindPill} slower={networkLoss.slower} looser={networkLoss.looser} showRoute dates={lossDates()} onPick={openLossRow} /> } : null;
  const routeLossWidget: PanelWidget | null = routeLoss && route ? { key: 'falls-behind', size: 'medium', node: <FallsBehindWidget label={`${route} · ${STUDIO_LIVE_PENDING.fallsBehindPill}`} slower={routeLoss.slower} looser={routeLoss.looser} showRoute={false} dates={lossDates(route)} onPick={openLossRow} /> } : null;
  const backToNetwork = () => { setRoute(null); setDir(null); setPick(null); };
  // One panel, on the left: the network's overview with no route picked; the route's own figures once one is picked, with a way back.
  // CIV-1821: the main map's way back from a route (CardBackLink: small and muted, not a big link over the map).
  const back: PanelWidget = { key: 'back', size: 'medium', node: <CardBackLink onClick={backToNetwork}>{agencyName}</CardBackLink> };
  const routeBody: PanelWidget[] | null = !route ? null
    : v3 && ready ? [...(routeLossWidget ? [routeLossWidget] : []), ...routeWidgets({ data: ready, v3, dir: shown, band, setPick, route: ready.route })]
    : own.kind === 'loading' ? [{ key: 'loading', size: 'medium' as const, node: <LoadingWidget /> }] : [];
  const routePanel = routeBody && [back, ...routeBody];

  const showNote = ready?.note && (measure === 'late' || measure === 'runTime' || measure === 'delayStarts');
  // Each route as the list rows show it: the number in bold, the name regular, no dash (Ryan, CIV-1117 row 5).
  const routeOptions = useMemo(() => [['', ALL_ROUTES_LABEL] as const, ...rankRoutes(s, networkV3, measure, band).map(({ r }) => {
    const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency });
    return [r.route, <RouteRowName key={r.route} shortName={l.primary} name={l.secondary} />, l.text] as const;
  })], [s, networkV3, measure, band]);
  const openRoute = (r: string) => { setRoute(r); setPick(null); };
  const overview = <OverviewList s={s} measure={measure} band={band} route={route} network={networkV3} onPick={openRoute} />;
  const onMapPick = (p: MapPick | null) => { if (!route && p?.kind === 'segment' && p.route) setRoute(p.route); else setPick(p); };
  return {
    routes, ready, v3, ids, shown, model, heat, anchor, card, routePanel, routeBody, networkLossWidget, summary, overview, routeOptions,
    dataDates: v3 ? v3.window.dates : route ? [] : s.weekly?.thisWeek.dates ?? [], dataRoute: v3 ? ready?.route ?? '' : '',
    note: showNote ? ready!.note : undefined,
    frameKey: ready && route ? `route-${ready.route}` : `network-${network.size === routes.length ? 'all' : 'loading'}`,
    onMapPick, loadingRoute: own.kind === 'loading', backToNetwork, openRoute,
  };
}
