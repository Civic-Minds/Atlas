/**
 * What the planner map draws for one route and direction: each segment between two consecutive stops, and each stop, with
 * a value for the chosen measure and the colour step it falls in. A stop measure (late, bunching, extra wait) colours the
 * segment that leaves the stop; run time colours a segment by the minutes it adds. A value that is not measured (a branch
 * stop's bunching, an infrequent stop's extra wait) has no step and draws grey. Lines come from `v3.segmentLines` when the
 * analysis has them (street lines), else straight between stops.
 */
import type { DashboardBand, LiveV3 } from '../../../shared/liveDashboard';
import { titleCase } from '../../utils/format';
import { shortStopName } from './routeStripModel';

export type MapMeasure = 'late' | 'runTime' | 'extraWait' | 'bunching';
/** The measure switch, in order, with the labels the tiles already use. */
export const MEASURES: ReadonlyArray<readonly [MapMeasure, string]> = [['late', 'Late'], ['runTime', 'Run time'], ['extraWait', 'Extra wait'], ['bunching', 'Bunching']];

/** Step cutoffs per measure: below the first is step 0, below the second step 1, else step 2. Late and bunching are shares; run time and extra wait are minutes. */
export const MAP_STEP_LIMITS: Record<MapMeasure, readonly [number, number]> = {
  late: [0.1, 0.2],
  bunching: [0.15, 0.25],
  runTime: [0.5, 1.5],
  extraWait: [1, 2],
};

export type MapStep = 0 | 1 | 2;
export const mapStep = (measure: MapMeasure, value: number | null): MapStep | null => {
  if (value == null || Number.isNaN(value)) return null;
  const [a, b] = MAP_STEP_LIMITS[measure];
  return value < a ? 0 : value < b ? 1 : 2;
};

export interface MapStop { stopId: string; name: string; lonLat: [number, number]; value: number | null; step: MapStep | null; n: number }
/** `route` and `offset` are set when several routes share one map (the network): a click then picks the route, and the two directions are drawn side by side. */
export interface MapSegment { fromStopId: string; toStopId: string; coordinates: [number, number][]; value: number | null; step: MapStep | null; route?: string; offset?: number; /** "A to B", for the map's hover. */ label?: string }
export interface RouteMapModel { directionId: number; segments: MapSegment[]; stops: MapStop[] }

const key = (a: string, b: string) => `${a}>${b}`;

/** The route's consecutive stop pairs along every regular pattern (the main one only for an older file), each once. */
function stopPairs(v3: LiveV3, directionId: number, mainOrder: string[]): Array<[string, string]> {
  const lists = v3.patterns?.[String(directionId)]?.map(p => p.stops.map(s => s.stopId)) ?? [mainOrder];
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const list of lists) for (let i = 0; i + 1 < list.length; i++) { const k = key(list[i], list[i + 1]); if (!seen.has(k)) { seen.add(k); out.push([list[i], list[i + 1]]); } }
  return out;
}

export function routeMapModel(v3: LiveV3, directionId: number, band: DashboardBand, measure: MapMeasure): RouteMapModel {
  const bandData = v3.bands[band];
  const stopsHere = bandData.stops.filter(s => s.directionId === directionId);
  const byId = new Map(stopsHere.map(s => [s.stopId, s]));
  const mainOrder = stopsHere.filter(s => s.order >= 0).sort((a, b) => a.order - b.order).map(s => s.stopId);
  const bunchById = new Map((v3.bunching.find(b => b.directionId === directionId)?.bands[band]?.stops ?? []).map(s => [s.stopId, s]));
  const waitById = new Map((v3.extraWait?.[band] ?? []).filter(s => s.directionId === directionId).map(s => [s.stopId, s]));
  const stretchBy = new Map((bandData.buildup.find(b => b.directionId === directionId)?.stretches ?? []).map(s => [key(s.fromStopId, s.toStopId), s]));
  const lines = new Map((v3.segmentLines?.[String(directionId)] ?? []).map(l => [key(l.from, l.to), l.coordinates]));

  const stopValue = (stopId: string): number | null => {
    const s = byId.get(stopId);
    if (!s || s.n === 0) return null;
    switch (measure) {
      case 'late': return s.lateShare;
      case 'bunching': { const b = bunchById.get(stopId); return b && b.n > 0 ? b.badShare : null; }
      case 'extraWait': { const w = waitById.get(stopId); return w ? Math.max(0, w.extraWaitMin) : null; }
      default: return null;
    }
  };
  const segmentValue = (from: string, to: string): number | null => {
    if (measure === 'runTime') { const s = stretchBy.get(key(from, to)); return s && s.n > 0 ? Math.max(0, s.medianAddedMin) : null; }
    return stopValue(from);
  };

  const stops: MapStop[] = stopsHere.filter(s => s.lonLat && (mainOrder.includes(s.stopId) || v3.patterns?.[String(directionId)]?.some(p => p.stops.some(x => x.stopId === s.stopId)))).map(s => {
    const value = measure === 'runTime' ? null : stopValue(s.stopId);
    return { stopId: s.stopId, name: titleCase(s.name), lonLat: s.lonLat as [number, number], value, step: mapStep(measure, value), n: s.n };
  });
  const segments: MapSegment[] = [];
  for (const [from, to] of stopPairs(v3, directionId, mainOrder)) {
    const a = byId.get(from), b = byId.get(to);
    if (!a?.lonLat || !b?.lonLat) continue;
    const value = segmentValue(from, to);
    segments.push({ label: `${shortStopName(titleCase(a.name))} to ${shortStopName(titleCase(b.name))}`, fromStopId: from, toStopId: to, coordinates: lines.get(key(from, to)) ?? [a.lonLat as [number, number], b.lonLat as [number, number]], value, step: mapStep(measure, value) });
  }
  return { directionId, segments, stops };
}
