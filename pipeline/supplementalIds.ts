/**
 * One agency built from several GTFS feeds (`supplementalFeedUrls`) shares one id space: the trips index,
 * the stops index and the running times are merged by id, and features carry route ids. NJ Transit's bus
 * and rail feeds both number routes, trips and shapes from 1, so rail trip 1 would overwrite bus trip 1.
 *
 * - `supplementalIdPrefixes` (agency config, by feed URL) prefixes one feed's route, trip and shape ids
 *   ("rail:"). It is explicit, so the ids stay the same when a later feed version stops colliding.
 * - Without a prefix, a supplemental feed whose route, trip or shape ids collide with the main feed's (or
 *   an earlier supplemental's) fails the build instead of publishing merged-over data.
 * Stop ids are never prefixed and a shared stop id is only reported: two feeds may list the same stop.
 */
import JSZip from 'jszip';
import Papa from 'papaparse';
import type { GtfsData } from '../types/gtfs.js';

export interface GtfsIdSets {
  route: Set<string>;
  trip: Set<string>;
  shape: Set<string>;
  stop: Set<string>;
}

async function readColumn(zip: JSZip, file: string, columns: string[]): Promise<Record<string, Set<string>>> {
  const out = Object.fromEntries(columns.map(c => [c, new Set<string>()]));
  const entry = Object.values(zip.files).find(f => !f.dir && f.name.split('/').pop() === file);
  if (!entry) return out;
  const text = (await entry.async('string')).replace(/^﻿/, '');
  const rows = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
  for (const row of rows) for (const c of columns) { const v = row[c]?.trim(); if (v) out[c].add(v); }
  return out;
}

/** The route, trip, shape and stop ids a feed defines, read from routes.txt, trips.txt and stops.txt only. */
export async function gtfsIdSets(buf: Buffer, prefix = ''): Promise<GtfsIdSets> {
  const zip = await JSZip.loadAsync(buf);
  const [routes, trips, stops] = await Promise.all([
    readColumn(zip, 'routes.txt', ['route_id']),
    readColumn(zip, 'trips.txt', ['trip_id', 'shape_id']),
    readColumn(zip, 'stops.txt', ['stop_id']),
  ]);
  const p = (s: Set<string>) => new Set([...s].map(id => prefix + id));
  return { route: p(routes.route_id), trip: p(trips.trip_id), shape: p(trips.shape_id), stop: stops.stop_id };
}

/** Ids of `next` already defined by `seen`, per kind, with up to three examples each. */
export function idCollisions(seen: GtfsIdSets, next: GtfsIdSets): Array<{ kind: keyof GtfsIdSets; count: number; examples: string[] }> {
  return (['route', 'trip', 'shape', 'stop'] as const).flatMap(kind => {
    const hit = [...next[kind]].filter(id => seen[kind].has(id));
    return hit.length ? [{ kind, count: hit.length, examples: hit.slice(0, 3) }] : [];
  });
}

export function addIds(into: GtfsIdSets, from: GtfsIdSets): void {
  for (const kind of ['route', 'trip', 'shape', 'stop'] as const) for (const id of from[kind]) into[kind].add(id);
}

/** The feed with every route, trip and shape id prefixed, wherever the parsed feed holds one. */
export function prefixGtfsIds(gtfs: GtfsData, prefix: string): GtfsData {
  if (!prefix) return gtfs;
  const p = <T extends string | undefined>(id: T): T => (id ? `${prefix}${id}` : id) as T;
  return {
    ...gtfs,
    ...(gtfs.synthesizedDirectionRouteIds ? { synthesizedDirectionRouteIds: new Set([...gtfs.synthesizedDirectionRouteIds].map(id => p(id))) } : {}),
    routes: gtfs.routes.map(r => ({ ...r, route_id: p(r.route_id) })),
    trips: gtfs.trips.map(t => ({ ...t, route_id: p(t.route_id), trip_id: p(t.trip_id), shape_id: p(t.shape_id) })),
    stopTimes: gtfs.stopTimes.map(st => ({ ...st, trip_id: p(st.trip_id) })),
    shapes: gtfs.shapes.map(s => ({ ...s, id: p(s.id) })),
    ...(gtfs.frequencies ? { frequencies: gtfs.frequencies.map(f => ({ ...f, trip_id: p(f.trip_id) })) } : {}),
    ...(gtfs.fareRules ? { fareRules: gtfs.fareRules.map(f => ({ ...f, route_id: p(f.route_id) })) } : {}),
    ...(gtfs.shapeAnomalies ? { shapeAnomalies: gtfs.shapeAnomalies.map(a => ({ ...a, shapeId: p(a.shapeId) })) } : {}),
  };
}
