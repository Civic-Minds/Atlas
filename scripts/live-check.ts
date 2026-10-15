/**
 * Live check: for every Tier 1 route, every vehicle the feed reports must be placed in a direction group on the route card.
 * Needs the local API server (npm run live, or npm run dev:api) and reads the route shapes from the published release.
 *
 *   npm run live:check [-- --api http://localhost:5001] [--agency ttc] [--routes 501,504]
 *
 * Prints "N of N placed" per route. A vehicle whose direction cannot be told is still placed (group "Direction unclear") and
 * is counted separately so it shows. Exits 1 if any vehicle is missing from the groups, or the API or shapes are unreachable.
 */
import { inferLiveDirection } from '../src/utils/liveDirection';
import { DIRECTION_UNCLEAR, groupVehiclesByDirection, routeDirectionLabels } from '../src/utils/liveGrouping';
import type { LiveVehicle } from '../src/context/LiveVehiclesMapOverlay';

const TIER_1: Record<string, string[]> = { ttc: ['501', '503', '504', '505', '506', '507', '509', '510', '511', '512'] };
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const API = opt('api', `http://localhost:${process.env.ATLAS_API_PORT ?? 5001}`).replace(/\/$/, '');
const agency = opt('agency', 'ttc');
const routes = opt('routes', '') ? opt('routes', '').split(',') : TIER_1[agency] ?? [];
const DATA = 'https://data.transitatlas.fyi';

function die(message: string): never { console.error(`live:check: ${message}`); process.exit(1); }

async function main() {
  if (routes.length === 0) die(`no routes for ${agency}; pass --routes`);
  let vehicles: LiveVehicle[];
  try {
    const res = await fetch(`${API}/api/live-vehicles?agency=${agency}`);
    if (!res.ok) die(`${API} answered ${res.status} for ${agency}. Is Live running? Start it with: npm run live`);
    vehicles = ((await res.json()) as { vehicles: LiveVehicle[] }).vehicles.map(v => ({ ...v, agencySlug: agency }));
  } catch (e) {
    die(`cannot reach ${API} (${(e as Error).message}). Start Live with: npm run live`);
  }
  let features: GeoJSON.Feature[];
  try {
    const release = await (await fetch(`${DATA}/atlas/release.json`)).json() as { agencyPrefix: string };
    features = ((await (await fetch(`${DATA}/${release.agencyPrefix}/${agency}.json`)).json()) as GeoJSON.FeatureCollection).features;
  } catch (e) {
    die(`cannot read the ${agency} route shapes from ${DATA} (${(e as Error).message}).`);
  }
  let bad = 0;
  let unclearTotal = 0;
  for (const route of routes) {
    const routeFeatures = features.filter(f => (f.properties as { routeShortName?: string } | null)?.routeShortName === route);
    const mine = vehicles.filter(v => v.routeShortName === route);
    if (mine.length === 0) { console.log(`${agency} ${route.padEnd(4)} no vehicles on the feed right now`); continue; }
    const resolved = mine.map(v => { const m = inferLiveDirection(v, routeFeatures); return { ...v, directionId: m.directionId, headsign: m.headsign }; });
    const groups = groupVehiclesByDirection(resolved, routeDirectionLabels(routeFeatures, route));
    const placed = [...groups.values()].reduce((n, g) => n + g.length, 0);
    const unclear = groups.get(DIRECTION_UNCLEAR)?.length ?? 0;
    unclearTotal += unclear;
    if (placed !== mine.length) bad++;
    console.log(`${agency} ${route.padEnd(4)} ${placed} of ${mine.length} placed` + (unclear ? `  (${unclear} in "${DIRECTION_UNCLEAR}")` : '') + `  [${[...groups].map(([k, g]) => `${k}: ${g.length}`).join(', ')}]` + (placed !== mine.length ? '  <-- MISSING' : ''));
  }
  console.log(bad === 0 ? `ok: every vehicle placed${unclearTotal ? ` (${unclearTotal} with unclear direction)` : ''}` : `FAILED: ${bad} route(s) lose vehicles`);
  process.exit(bad === 0 ? 0 : 1);
}
void main();
