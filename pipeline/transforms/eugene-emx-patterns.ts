import type { GtfsData } from '../../types/gtfs.js';

/**
 * Lane Transit District EmX (CIV-2012). Eastbound EmX (direction 0, Willow Creek to Gateway) runs two patterns turn
 * about, each every 20: one round the Gateway loop by RiverBend to Gateway Bay C, one the other way by Pheasant to
 * Gateway Bay D. The feed gives both the one headsign "EmX EUGENE STATION", and they end at different stops, so Atlas
 * keeps one of them as the direction's row and its other 43 trips are on no row: the card and route list read the Bay C
 * trips alone ("every 42" in AM peak, a 6:28 to 7:09 gap) and the branch list says direction 0 has 44 trips, not 87.
 * The filter value is read from the whole stretch and was right all along.
 *
 * Each such pattern takes a headsign made from the feed's own stop names: its last stop's name up to the bay ("Gateway
 * Sta."), then "via" the first stop only it serves, with the feed's loop suffix ("_counter-clockwise") left off. So the
 * direction has a row for each, with its own trips. Westbound starts at the two bays and ends at one stop, so it is one
 * row already and is left alone, as is every other route and headsign.
 *
 * Done only when all of these hold, else the feed is left as published (with the reason):
 * - one direction of route EmX has a headsign whose two most-run stop sequences end at different stops;
 * - each of the two has a stop the other doesn't serve, with a name;
 * - their last stops' names share the part before "-Bay" (one terminal).
 * Only trips of that headsign whose sequence is one of the two are renamed.
 */
const ROUTE_SHORT_NAME = 'EmX';
const LOOP_SUFFIX = /_(counter-)?clockwise$/i;
const BAY_PART = /-Bay\b.*$/i;

export function nameEugeneEmxPatterns(gtfs: GtfsData): { gtfs: GtfsData; renamed: Record<string, number>; reason?: string } {
  const routeIds = new Set((gtfs.routes ?? []).filter(r => (r.route_short_name ?? '').trim() === ROUTE_SHORT_NAME).map(r => r.route_id));
  if (routeIds.size === 0) return { gtfs, renamed: {}, reason: 'no EmX route in the feed' };
  const stopName = new Map((gtfs.stops ?? []).map(s => [s.stop_id, (s.stop_name ?? '').trim()]));
  const stopsByTrip = new Map<string, Array<{ seq: number; stopId: string }>>();
  for (const st of gtfs.stopTimes ?? []) {
    let list = stopsByTrip.get(st.trip_id);
    if (!list) { list = []; stopsByTrip.set(st.trip_id, list); }
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id });
  }
  const seqOf = (tripId: string) => (stopsByTrip.get(tripId) ?? []).sort((a, b) => a.seq - b.seq).map(s => s.stopId);

  // route, direction and headsign -> stop sequence -> trips
  const groups = new Map<string, Map<string, { seq: string[]; trips: string[] }>>();
  for (const t of gtfs.trips) {
    if (!routeIds.has(t.route_id)) continue;
    const seq = seqOf(t.trip_id);
    if (seq.length < 2) continue;
    const key = `${t.route_id}\u0000${t.direction_id ?? ''}\u0000${(t.trip_headsign ?? '').trim()}`;
    let patterns = groups.get(key);
    if (!patterns) { patterns = new Map(); groups.set(key, patterns); }
    const k = seq.join('\u0000');
    let p = patterns.get(k);
    if (!p) { p = { seq, trips: [] }; patterns.set(k, p); }
    p.trips.push(t.trip_id);
  }

  const headsignOf = new Map<string, string>();
  const renamed: Record<string, number> = {};
  const reasons: string[] = [];
  for (const [key, patterns] of groups) {
    const [a, b] = [...patterns.values()].sort((x, y) => y.trips.length - x.trips.length);
    if (!a || !b) continue;
    const lastA = a.seq[a.seq.length - 1], lastB = b.seq[b.seq.length - 1];
    if (lastA === lastB) continue;
    const terminal = (stopId: string) => (stopName.get(stopId) ?? '').replace(BAY_PART, '').trim();
    if (!terminal(lastA) || terminal(lastA) !== terminal(lastB)) { reasons.push(`${key.split('\u0000')[2]}: its two patterns end at different terminals`); continue; }
    const via = (mine: string[], theirs: string[]) => {
      const other = new Set(theirs);
      const own = mine.find(s => !other.has(s) && s !== mine[mine.length - 1] && (stopName.get(s) ?? '').replace(LOOP_SUFFIX, '').trim());
      return own ? (stopName.get(own) ?? '').replace(LOOP_SUFFIX, '').trim() : null;
    };
    const viaA = via(a.seq, b.seq), viaB = via(b.seq, a.seq);
    if (!viaA || !viaB || viaA === viaB) { reasons.push(`${key.split('\u0000')[2]}: no stop of its own to name a pattern by`); continue; }
    for (const [p, v] of [[a, viaA], [b, viaB]] as const) {
      const name = `${terminal(p.seq[p.seq.length - 1])} via ${v}`;
      for (const id of p.trips) headsignOf.set(id, name);
      renamed[name] = p.trips.length;
    }
  }
  if (headsignOf.size === 0) return { gtfs, renamed, reason: reasons.join('; ') || 'no headsign with two patterns ending at different stops' };
  return {
    gtfs: { ...gtfs, trips: gtfs.trips.map(t => (headsignOf.has(t.trip_id) ? { ...t, trip_headsign: headsignOf.get(t.trip_id)! } : t)) },
    renamed,
  };
}
