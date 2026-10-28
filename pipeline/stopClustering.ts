/**
 * Stop groups (hubs) for the map's middle zoom, where one dot stands for each group (useRouteStyling:
 * isHubRef), for a stop's sibling stops, and for grouping stop search results by hubId.
 *
 * #1147: groups were built by chaining any two linked stops (union-find), with no size or radius limit, so
 * stops whose names share a street ("KING at LAKE", "KING at ...") chained along a corridor: in Hamilton one
 * dot stood for 557 stops up to 7.8 km away. Now each group is built around one anchor stop, its dot: stops
 * are taken best first (rail, then hub, then most routes), and each untaken one becomes an anchor that takes
 * every untaken stop linked to it directly. Nothing joins through another member, so every stop in a group is
 * within GROUP_RADIUS_M of the group's dot.
 *
 * A stop links to an anchor within GROUP_RADIUS_M when it has the same agency and name, or is within
 * CLOSE_PROXIMITY_M, or shares a name word that isn't generic (a station's own name across agencies).
 */

/** The farthest a group's stop may be from its dot. 250 m: the old name-match reach, and in 6 of 7 agencies
 *  checked (Hamilton, TTC, GO, MARTA, TriMet, Valley Metro, OC Transpo) 93-99% of same-named stop pairs, the
 *  platforms and opposite-side stops of one place, are within it (OC Transpo's Transitway stations spread wider: 89%). */
export const GROUP_RADIUS_M = 250;
/** Any two stops this close are one place, whatever their names (e.g. two agencies' stops at a corner). */
export const CLOSE_PROXIMITY_M = 150;

export interface ClusterStop {
  geometry?: { coordinates?: number[] } | null;
  properties: Record<string, any>;
}

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = ((lat1 + lat2) * Math.PI) / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = ((lon2 - lon1) * 40075000 * Math.cos(latMid)) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

const GENERIC_NAME_WORDS = new Set([
  'stop', 'station', 'terminal', 'bay', 'bays', 'platform', 'direction', 'cta', 'pace', 'metra', 'loop', 'transit',
  'center', 'ctr', 'bus', 'train', 'rail', 'subway', 'rapid', 'rt', 'rd', 'st', 'ave', 'blvd', 'street', 'avenue',
  'road', 'park-n-ride', 'park', 'ride', 'parking', 'at', 'and', '&', 'to', 'from', 'for',
]);

/** A stop name's distinctive words (lower case, three letters or more, generic transit and street words left out). */
export function cleanStopName(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !GENERIC_NAME_WORDS.has(token));
}

function shareTokens(tokens1: string[], tokens2: string[]): boolean {
  if (tokens1.length === 0 || tokens2.length === 0) return false;
  return tokens1.some(t => tokens2.includes(t));
}

/** How strongly a stop stands for a place: rail first, then a hub, then the number of routes. */
function anchorScore(p: Record<string, any>): number {
  return (p.isRail ? 1000 : 0) + (p.isHub ? 100 : 0) + (Array.isArray(p.routeIds) ? p.routeIds.length : 0);
}

/** Sets hubId on every stop and isHubRef on each group's anchor. Returns the number of groups. */
export function runStopClustering(stops: ClusterStop[], radiusM = GROUP_RADIUS_M): number {
  const N = stops.length;
  const names = stops.map(s => s.properties.stopName || s.properties.name || '');
  const tokens = names.map(cleanStopName);
  const coords = stops.map(s => {
    const c = s.geometry?.coordinates || [0, 0];
    return { lon: c[0], lat: c[1] };
  });

  // Grid of 0.01-degree cells (about 1.1 km north-south); the cell and its neighbours cover the radius.
  const cellOf = (i: number) => [Math.floor(coords[i].lon * 100), Math.floor(coords[i].lat * 100)];
  const grid = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const [x, y] = cellOf(i);
    const key = `${x},${y}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  }

  const order = [...Array(N).keys()].sort((a, b) => anchorScore(stops[b].properties) - anchorScore(stops[a].properties) || a - b);
  const anchorOf = new Int32Array(N).fill(-1);
  let groups = 0;
  for (const anchor of order) {
    if (anchorOf[anchor] !== -1) continue;
    anchorOf[anchor] = anchor;
    const hubId = `h_${++groups}`;
    stops[anchor].properties.hubId = hubId;
    stops[anchor].properties.isHubRef = true;
    const { lat, lon } = coords[anchor];
    const agency = stops[anchor].properties.agencySlug;
    const [x, y] = cellOf(anchor);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${x + dx},${y + dy}`) ?? []) {
          if (anchorOf[j] !== -1) continue;
          const d = getDistanceMeters(lat, lon, coords[j].lat, coords[j].lon);
          if (d > radiusM) continue;
          const sameNameSameAgency = agency === stops[j].properties.agencySlug && !!names[anchor] && names[anchor] === names[j];
          if (sameNameSameAgency || d <= CLOSE_PROXIMITY_M || shareTokens(tokens[anchor], tokens[j])) {
            anchorOf[j] = anchor;
            stops[j].properties.hubId = hubId;
          }
        }
      }
    }
  }
  return groups;
}
