import type { GtfsData } from '../types/gtfs.js';
import { isRedundantWithRouteName } from '../shared/headsignDisplay.js';

function LevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * A route that labels some trips' direction_id and leaves others blank (#730: Coast NH route 40
 * labels most weekday trips but none of its Saturday ones). The blank trips used to fall into
 * direction 0 wholesale, so Saturday's inbound trips were drawn as part of the outbound line and the
 * inbound direction vanished. A blank trip takes the direction the route's labelled trips use on the
 * same shape, else on the same headsign (or last stop), and only when that is one direction; any
 * other blank trip is left as it was. The route is not marked synthesized: its labels are the feed's.
 */
function fillBlankDirections(
  trips: NonNullable<GtfsData['trips']>,
  hasDir: (t: NonNullable<GtfsData['trips']>[number]) => boolean,
  lastStopByTrip: Map<string, string>,
  stopNameById: Map<string, string>,
): number {
  const destination = (t: NonNullable<GtfsData['trips']>[number]) => {
    const headsign = t.trip_headsign?.trim();
    if (headsign) return headsign;
    const last = lastStopByTrip.get(t.trip_id);
    return last ? stopNameById.get(last) : undefined;
  };
  const byShape = new Map<string, Set<string>>();
  const byDestination = new Map<string, Set<string>>();
  for (const t of trips) {
    if (!hasDir(t)) continue;
    const dir = String(t.direction_id).trim();
    if (t.shape_id) byShape.set(t.shape_id, (byShape.get(t.shape_id) ?? new Set()).add(dir));
    const dest = destination(t);
    if (dest) byDestination.set(dest, (byDestination.get(dest) ?? new Set()).add(dir));
  }
  const only = (dirs: Set<string> | undefined) => (dirs && dirs.size === 1 ? [...dirs][0] : null);
  let filled = 0;
  for (const t of trips) {
    if (hasDir(t)) continue;
    const shapeDirs = t.shape_id ? byShape.get(t.shape_id) : undefined;
    // The shape decides when labelled trips use it one way only; otherwise the destination does.
    // When the two disagree (the shape says one way, the destination the other), the trip stays blank.
    const dest = destination(t);
    const byShapeDir = only(shapeDirs);
    const byDestDir = only(dest ? byDestination.get(dest) : undefined);
    if (byShapeDir != null && byDestDir != null && byShapeDir !== byDestDir) continue;
    const dir = byShapeDir ?? byDestDir;
    if (dir == null) continue;
    t.direction_id = dir;
    filled++;
  }
  return filled;
}

/** How two stop patterns relate: the same way (one runs its shared stops in the other's order), the opposite way, or unknown. */
type Relation = 'same' | 'opposite' | null;

/** Fewest shared stops two patterns need before their order says anything (two are only the ends). */
const MIN_SHARED_STOPS = 3;
/** Share of the shared stops' steps that must run one way for the order to decide. */
const MIN_ORDER_AGREEMENT = 0.8;

function sharedOrder(a: readonly string[], b: readonly string[]): number[] {
  const posA = new Map<string, number>();
  a.forEach((stop, i) => { if (!posA.has(stop)) posA.set(stop, i); });
  const seen = new Set<string>();
  const order: number[] = [];
  for (const stop of b) {
    if (seen.has(stop)) continue;
    seen.add(stop);
    const i = posA.get(stop);
    if (i != null) order.push(i);
  }
  return order;
}

function relation(a: readonly string[], b: readonly string[]): Relation {
  // A trip back from where the other ends, to where it starts, is the other direction, whatever stops they share on
  // the way (Kingston 2 and 10 both run one loop the same way round: 2020 feed).
  const [a0, a1, b0, b1] = [a[0], a[a.length - 1], b[0], b[b.length - 1]];
  if (a0 !== a1 && b0 === a1 && b1 === a0) return 'opposite';
  const order = sharedOrder(a, b);
  if (order.length < MIN_SHARED_STOPS) return null;
  let up = 0, down = 0;
  for (let i = 1; i < order.length; i++) (order[i] > order[i - 1] ? up++ : down++);
  const steps = up + down;
  if (up / steps >= MIN_ORDER_AGREEMENT) return 'same';
  if (down / steps >= MIN_ORDER_AGREEMENT) return 'opposite';
  return null;
}

/** The place a headsign names, without its "via …" part: "Express - Cataraqui Centre via Downtown" → "express - cataraqui centre". */
function destinationOf(headsign: string | null | undefined): string {
  return (headsign ?? '').replace(/\s+via\s+.*$/i, '').trim().toLowerCase();
}

/**
 * CIV-1500: a route the feed gives no direction_id, its direction read trip by trip. Kingston Transit's 2017 and 2020
 * feeds carry both directions of local routes 1-20 and 501/502 under one route number with no direction_id, and split
 * one-way 701/702 trips in two at Downtown. Patterns (a trip's ordered stops) are placed one at a time, the busiest
 * first as direction 0:
 * 1. A pattern running back from where a placed one ends to where it starts takes the other direction; one sharing at
 *    least three stops with a placed one, in the same order or the reverse, takes its direction or the other one.
 * 2. Otherwise a pattern whose headsign names the same place as a placed one ("… via …" left off) takes its direction
 *    (the two halves of a 701 trip both read "Express - Cataraqui Centre via …").
 * 3. Otherwise, once, the busiest pattern sharing fewer than three stops with every direction-0 pattern and naming a
 *    different place starts direction 1 (opposite directions usually stop on opposite sides of the street).
 *
 * Returns each trip's direction, or null when a trip can't be placed or the evidence disagrees. The route then keeps
 * the old shape-and-headsign guess and stays marked synthesized, which withholds its stretch values.
 */
export function inferDirectionsFromStopOrder(
  trips: readonly { trip_id: string; trip_headsign?: string | null }[],
  stopsByTrip: ReadonlyMap<string, readonly string[]>,
): Map<string, '0' | '1'> | null {
  type Pattern = { stops: readonly string[]; trips: string[]; headsigns: Map<string, number>; destination: string };
  const patterns = new Map<string, Pattern>();
  for (const t of trips) {
    const stops = stopsByTrip.get(t.trip_id);
    if (!stops || stops.length < 2) return null;
    const key = stops.join('\u0000');
    const p: Pattern = patterns.get(key) ?? { stops, trips: [], headsigns: new Map(), destination: '' };
    p.trips.push(t.trip_id);
    const h = destinationOf(t.trip_headsign);
    p.headsigns.set(h, (p.headsigns.get(h) ?? 0) + 1);
    patterns.set(key, p);
  }
  for (const p of patterns.values()) p.destination = [...p.headsigns].sort((a, b) => b[1] - a[1])[0][0];
  const list = [...patterns.values()].sort((a, b) => b.trips.length - a.trips.length || b.stops.length - a.stops.length);
  if (list.length === 0) return null;
  const dirOf = new Map<Pattern, '0' | '1'>([[list[0], '0']]);
  const flip = (d: '0' | '1'): '0' | '1' => (d === '0' ? '1' : '0');
  let seededOne = false;
  for (;;) {
    let progress = false;
    for (const p of list) {
      if (dirOf.has(p)) continue;
      const byOrder = new Set<'0' | '1'>();
      const byName = new Set<'0' | '1'>();
      for (const [q, d] of dirOf) {
        const r = relation(q.stops, p.stops);
        if (r) byOrder.add(r === 'same' ? d : flip(d));
        if (p.destination && p.destination === q.destination) byName.add(d);
      }
      if (byOrder.size > 1 || byName.size > 1) return null;
      if (byOrder.size === 1 && byName.size === 1 && [...byOrder][0] !== [...byName][0]) return null;
      const d = [...byOrder][0] ?? [...byName][0];
      if (d) { dirOf.set(p, d); progress = true; }
    }
    if (progress) continue;
    const unplaced = list.filter(p => !dirOf.has(p));
    if (unplaced.length === 0) break;
    if (seededOne) return null;
    const zero = [...dirOf].filter(([, d]) => d === '0').map(([q]) => q);
    const seed = unplaced.find(p => zero.every(q => sharedOrder(q.stops, p.stops).length < MIN_SHARED_STOPS && q.destination !== p.destination));
    if (!seed) return null;
    dirOf.set(seed, '1');
    seededOne = true;
  }
  const out = new Map<string, '0' | '1'>();
  for (const [p, d] of dirOf) for (const id of p.trips) out.set(id, d);
  return out;
}

export function synthesizeMissingDirections(gtfs: GtfsData): GtfsData {
  if (!gtfs.trips || gtfs.trips.length === 0) return gtfs;

  const tripsByRoute = new Map<string, typeof gtfs.trips>();
  for (const t of gtfs.trips) {
    if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
    tripsByRoute.get(t.route_id)!.push(t);
  }

  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }
  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
  // Each unlabelled route's trips' stops in visiting order (CIV-1500), only for routes with no direction_id at all.
  const unlabelledRoutes = new Set([...tripsByRoute].filter(([, ts]) => !ts.some(t => t.direction_id != null && String(t.direction_id).trim() !== '')).map(([id]) => id));
  const stopsByTrip = new Map<string, readonly string[]>();
  if (unlabelledRoutes.size > 0) {
    const routeOfTrip = new Map(gtfs.trips.filter(t => unlabelledRoutes.has(t.route_id)).map(t => [t.trip_id, t.route_id]));
    const visits = new Map<string, { seq: number; stop: string }[]>();
    for (const st of gtfs.stopTimes ?? []) {
      if (!routeOfTrip.has(st.trip_id)) continue;
      const seq = parseInt(st.stop_sequence);
      if (Number.isNaN(seq)) continue;
      const list = visits.get(st.trip_id) ?? [];
      list.push({ seq, stop: st.stop_id });
      visits.set(st.trip_id, list);
    }
    for (const [tripId, list] of visits) stopsByTrip.set(tripId, list.sort((a, b) => a.seq - b.seq).map(v => v.stop));
  }

  let synthesizedCount = 0;
  let inferredCount = 0;
  let filledCount = 0;
  for (const [, rTrips] of tripsByRoute.entries()) {
    const hasDir = (t: (typeof rTrips)[number]) => t.direction_id != null && String(t.direction_id).trim() !== '';
    const hasAnyDir = rTrips.some(hasDir);
    if (hasAnyDir) {
      filledCount += fillBlankDirections(rTrips, hasDir, lastStopByTrip, stopNameById);
      continue;
    }

    // CIV-1500: read from the order trips visit stops; the route is then treated as the feed's own directions.
    const inferred = inferDirectionsFromStopOrder(rTrips, stopsByTrip);
    if (inferred) {
      for (const t of rTrips) t.direction_id = inferred.get(t.trip_id)!;
      (gtfs.inferredDirectionRouteIds ??= new Set()).add(rTrips[0].route_id);
      inferredCount += rTrips.length;
      continue;
    }

    const groups = new Map<string, typeof gtfs.trips>();
    for (const t of rTrips) {
      let headsign = t.trip_headsign?.trim();
      if (!headsign) {
        const lastStopId = lastStopByTrip.get(t.trip_id);
        if (lastStopId) headsign = stopNameById.get(lastStopId);
      }
      const key = t.shape_id || headsign || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    if (sortedGroups.length > 0) {
      (gtfs.synthesizedDirectionRouteIds ??= new Set()).add(rTrips[0].route_id);
      const [key0, trips0] = sortedGroups[0];
      for (const t of trips0) {
        t.direction_id = '0';
        synthesizedCount++;
      }

      if (sortedGroups.length > 1) {
        const [key1, trips1] = sortedGroups[1];
        for (const t of trips1) {
          t.direction_id = '1';
          synthesizedCount++;
        }

        for (let i = 2; i < sortedGroups.length; i++) {
          const [keyI, tripsI] = sortedGroups[i];
          const dist0 = LevenshteinDistance(keyI, key0);
          const dist1 = LevenshteinDistance(keyI, key1);
          const dir = dist0 <= dist1 ? '0' : '1';
          for (const t of tripsI) {
            t.direction_id = dir;
            synthesizedCount++;
          }
        }
      }
    }
  }

  if (synthesizedCount > 0) {
    console.log(`Synthesized direction_id for ${synthesizedCount} trips across routes lacking direction_id.`);
  }
  if (inferredCount > 0) {
    console.log(`Inferred direction_id for ${inferredCount} trips from the order they visit stops (routes lacking direction_id).`);
  }
  if (filledCount > 0) {
    console.log(`Filled direction_id for ${filledCount} unlabelled trips from labelled trips on the same shape or headsign.`);
  }

  return gtfs;
}

/**
 * Replace missing or route-name-only trip headsigns with the trip's terminal stop.
 * Feeds sometimes publish a line name (e.g. "GREEN LINE") as the headsign for
 * both directions, which leaves route cards without a useful destination.
 */
export function synthesizeTripHeadsigns(gtfs: GtfsData): GtfsData {
  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }

  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));
  for (const trip of gtfs.trips ?? []) {
    const route = routeById.get(trip.route_id);
    const terminalName = stopNameById.get(lastStopByTrip.get(trip.trip_id) ?? '')?.trim();
    if (!route || !terminalName) continue;
    const raw = trip.trip_headsign?.trim() ?? '';
    if (!raw || isRedundantWithRouteName(raw, route.route_short_name ?? null, route.route_long_name ?? null)) {
      if (!isRedundantWithRouteName(terminalName, route.route_short_name ?? null, route.route_long_name ?? null)) {
        trip.trip_headsign = terminalName;
      }
    }
  }
  return gtfs;
}
