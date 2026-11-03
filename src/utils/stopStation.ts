/**
 * Which of a clicked stop's hub siblings are the same station (CIV-1305, Ryan 2026-11-03). The stop card lists only
 * the routes that stop at the clicked stop, plus those at the other platforms or bays of its station. A street stop
 * across the road is not the same station, even though the hub groups it for the map.
 *
 * Two signals, in order:
 * 1. GTFS parent_station, published as `parentStation` and `parentStationName` on stop points: the same parent counts
 *    when the parent's name says it is a station, or the stop's own name isn't a street corner ("MACKENZIE KING A",
 *    parent "MACKENZIE KING"). Some feeds use parents for street corners (MiWay `place_`: "Mavis Rd At Courtneypark Dr").
 * 2. With no parent data, the name: both names begin with the same station name ("Kipling Terminal Platform 3",
 *    "Kipling Terminal Platform 12"). A street stop named after a nearby station ("Bay St at Bloor St West - Bay
 *    Station") doesn't count, since the station name isn't where its name starts.
 */
export interface StationStop {
  stopId: string;
  stopName?: string | null;
  parentStation?: string | null;
  parentStationName?: string | null;
}

// The words that make a name a station's: "Kennedy Station", "Kipling Terminal", "Bingham Loop", "Ajax GO",
// "Salesforce Transit Center", "Sunset TC".
const STATION_WORD = /\b(?:station|stn|terminal|loop|transit cent(?:er|re)|tc|go)\b/i;
// Anything before the station word that makes it a street stop near a station, not the station itself.
const STREET_BEFORE = /\s(?:at|@|&|and)\s|\/|\s-\s/i;

/** The station a stop name starts with ("kipling terminal"), or null for a street stop or a name with no station word. */
export function stationNameOf(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  const m = STATION_WORD.exec(n);
  if (!m) return null;
  const head = n.slice(0, m.index + m[0].length);
  if (STREET_BEFORE.test(head) || !head.slice(0, m.index).trim()) return null;
  return head.toLowerCase();
}

// A street-corner name: "Mavis Rd At Courtneypark Dr", "Penn St. & 2nd St.", "HWY 7 / KIPLING".
const STREET_CORNER = /\s(?:at|@|&|and)\s|\//i;

function stationParent(stop: StationStop): string | null {
  if (!stop.parentStation) return null;
  return STATION_WORD.test(stop.parentStationName ?? '') || !STREET_CORNER.test(stop.stopName ?? '') ? stop.parentStation : null;
}

/** The ids of `siblings` (the clicked stop's own agency) that are the clicked stop's station, the clicked stop included. */
export function sameStationStopIds(clicked: StationStop, siblings: readonly StationStop[]): Set<string> {
  const ids = new Set([clicked.stopId]);
  const parent = stationParent(clicked);
  const name = stationNameOf(clicked.stopName);
  for (const s of siblings) {
    if (s.stopId === clicked.stopId) continue;
    const sParent = stationParent(s);
    // Both have parent data: the parent decides. Otherwise the station name does.
    const same = parent && sParent ? parent === sParent : name != null && stationNameOf(s.stopName) === name;
    if (same) ids.add(s.stopId);
  }
  return ids;
}
