/**
 * Directions for a route whose timetable has no direction_id (Kingston), filled by the pipeline's own
 * synthesizeMissingDirections (pipeline/synthesize-directions.ts), so the Live analysis splits the route the same way
 * the map does (CIV-1683). A route whose trips all carry direction_id (the TTC) is returned untouched.
 *
 * Caveat: the pipeline runs this after its other preprocessing (terminal-bay merges, headsign fill); here it runs on the
 * raw feed. The stop-order reading (CIV-1500) only looks at each trip's stops in order, which those steps rarely change.
 */
import type { GtfsData, GtfsStop, GtfsStopTime, GtfsTrip } from '../types/gtfs.js';
import { synthesizeMissingDirections } from '../pipeline/synthesize-directions.js';

export interface DirectionFill { trips: Record<string, string>[]; synthesized: boolean; inferred: boolean }

const hasDirection = (t: Record<string, string>) => t.direction_id != null && String(t.direction_id).trim() !== '';

/** Copies of `trips` (one route) with direction_id filled where the feed gave none. Logs nothing. */
export function fillMissingDirections(
  trips: readonly Record<string, string>[],
  stopTimes: readonly { trip_id: string; stop_id: string; stop_sequence: string }[],
  stops: readonly { stop_id: string; stop_name?: string }[] = [],
): DirectionFill {
  if (trips.every(hasDirection)) return { trips: [...trips], synthesized: false, inferred: false };
  const copies = trips.map(t => ({ ...t }));
  const gtfs = {
    trips: copies as unknown as GtfsTrip[],
    stopTimes: stopTimes as unknown as GtfsStopTime[],
    stops: stops as unknown as GtfsStop[],
  } as GtfsData;
  const log = console.log;
  console.log = () => {};
  try { synthesizeMissingDirections(gtfs); } finally { console.log = log; }
  return { trips: copies, synthesized: (gtfs.synthesizedDirectionRouteIds?.size ?? 0) > 0, inferred: (gtfs.inferredDirectionRouteIds?.size ?? 0) > 0 };
}
