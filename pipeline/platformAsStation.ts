/**
 * CIV-226: a drawn child platform reads as its station at the stop-grading layer.
 *
 * Sound Transit lists two platforms per Link station (S07-T1 and S07-T2 at Federal Way Downtown) and its
 * trips alternate between them, so each platform held half the trips, graded 60 and read every 20 while
 * the line runs every 10; the worst-drawn-stop rule and the stop-grade tier then carried that onto the
 * row. Where a row lists a platform and its parent station (the station's departures are the platforms'
 * visits, counted once per trip), the platform's list is replaced by the station's, so the stop's value,
 * its grade and the floors read what riders at the station get.
 *
 * Guard: only when the station's list for the whole route direction (the group map) holds exactly the
 * row's own trips, i.e. no other pattern of the route stops at that station, and every departure of the
 * platform is in the station's list (the station counts each trip's first visit: a loop that passes the
 * terminal twice, Brampton 32 at Trinity Common, leaves the second bay's own times out of the station's). Brampton 50 and 50A end at
 * different bays of Gore Meadows CC, and MBTA CR-Newburyport's 2-trip Beverly short turn shares Beverly
 * with the through trains: in both the station list would pool another pattern's trips, so the platform
 * keeps its own reading (the two parked attempts, v1 and v2, failed on exactly these).
 */
export interface PlatformRemap {
  /** The map with each remapped platform's list replaced by its station's (the input map when none). */
  map: Map<string, number[]>;
  /** platform stop id -> station stop id, for the remapped platforms. */
  remapped: Map<string, string>;
}

function containsTimes(station: readonly number[], platform: readonly number[]): boolean {
  const left = new Map<number, number>();
  for (const t of station) left.set(t, (left.get(t) ?? 0) + 1);
  for (const t of platform) {
    const n = left.get(t) ?? 0;
    if (n === 0) return false;
    left.set(t, n - 1);
  }
  return true;
}

function sameTimes(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

export function platformsAsStation(
  map: Map<string, number[]>,
  groupMap: Map<string, number[]> | undefined,
  childToParent: ReadonlyMap<string, string>,
  /** Which platforms may be remapped (process-core: drawn with a boardable value of their own). */
  eligible: (stopId: string) => boolean = () => true,
  /**
   * The service patterns (shape ids) of the row's trips at a stop. A platform is remapped only when every
   * sibling platform of its station carries the same patterns: at Canton Junction the Providence trains use
   * Track 2 and the Stoughton trains Track 6, one row by destination, and a rider at Track 2 does not get
   * the Stoughton trains.
   */
  patternsAt?: (stopId: string) => ReadonlySet<string> | undefined,
): PlatformRemap {
  const sameSet = (a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): boolean =>
    (a?.size ?? 0) === (b?.size ?? 0) && [...(a ?? [])].every(x => b?.has(x));
  const samePatternAsSiblings = (stopId: string, station: string): boolean => {
    if (!patternsAt) return true;
    const own = patternsAt(stopId);
    for (const other of map.keys()) {
      if (other === stopId || childToParent.get(other) !== station) continue;
      if (!sameSet(own, patternsAt(other))) return false;
    }
    return true;
  };
  let out: Map<string, number[]> | null = null;
  const remapped = new Map<string, string>();
  for (const stopId of map.keys()) {
    const station = childToParent.get(stopId);
    if (!station || station === stopId || !eligible(stopId)) continue;
    const stationTimes = map.get(station);
    if (!stationTimes || stationTimes.length === 0) continue;
    // Another pattern of the route stops at the station: its trips would pool into the platform.
    if (groupMap && groupMap !== map && !sameTimes(groupMap.get(station), stationTimes)) continue;
    if (!containsTimes(stationTimes, map.get(stopId) ?? [])) continue;
    if (!samePatternAsSiblings(stopId, station)) continue;
    (out ??= new Map(map)).set(stopId, stationTimes);
    remapped.set(stopId, station);
  }
  return { map: out ?? map, remapped };
}

/** The same remap applied to a twin map (the departure lists, CIV-1071): platform := its station's list. */
export function remapWith(map: Map<string, number[]>, remapped: ReadonlyMap<string, string>): Map<string, number[]> {
  if (remapped.size === 0) return map;
  const out = new Map(map);
  for (const [platform, station] of remapped) {
    const times = map.get(station);
    if (times) out.set(platform, times);
  }
  return out;
}
