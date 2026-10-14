import type { ShapeProperties } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import { HEADWAY_TIERS } from '../../shared/config';
import { pairOppositeStop } from '../../shared/sharedStops';
import { clipLinestring } from './lineClip';
import { getTierColor, type ColorVisionMode } from './colors';

/**
 * Route lines coloured section by section (CIV-152, beta only: FEATURES.segmentColours).
 *
 * Each route line keeps its base colour, the route's own tier. Over it, every stretch whose
 * own grade differs from that tier is drawn in the colour its grade earns, so a trunk every 10
 * shared by branches every 20 reads green where they run together and orange on each branch's
 * own stretch (Ryan, 2026-10-14). The grade is the pipeline's `stopTiers`: each drawn stop's
 * every-gap tier on its pooled list, the same method as the route tier, so a section is never
 * shown better than its own gaps allow (IndyGo Red reads every 10 with tier 15 and draws
 * nothing extra). A stop with no grade inside the line takes the worse of its graded
 * neighbours; a run of such stops at either end of the line is limited service and takes the
 * infrequent colour. The section is judged by the slower direction (#821): the matching stop of
 * the opposite direction (shared/sharedStops pairOppositeStop, the pairing the frequency overlay
 * uses) contributes its best grade and the section takes the worse of the two. Sections run from
 * half way before their first stop to half way after their last, so a colour changes between
 * two stops, not on one. All-day only: a period view keeps one colour per line.
 */

export interface SectionColourProperties {
  color: string;
  tier: string;
  /** The worst stop headway on the section; null where no stop has one. */
  headway: number | null;
  agencySlug: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  day: string | null;
}

export interface SectionRun {
  from: number;
  to: number;
  tier: string;
  headway: number | null;
}

const TIER_NAMES = HEADWAY_TIERS.map(({ max }) => (max === Infinity ? 'infrequent' : String(max)));
const rank = (tier: string | null | undefined): number => {
  if (tier == null) return -1;
  const i = TIER_NAMES.indexOf(tier);
  return i < 0 ? TIER_NAMES.length - 1 : i;
};
const worse = (a: string, b: string): string => (rank(a) >= rank(b) ? a : b);

/**
 * The sections of one line whose grade differs from `routeTier`, from its per-stop tiers (null:
 * no grade) and headways. Interior nulls take the worse neighbour; a null run at an end is
 * limited (infrequent).
 */
export function sectionRuns(stopTiers: ReadonlyArray<string | null>, routeTier: string, headways: ReadonlyArray<number | null> = []): SectionRun[] {
  const n = stopTiers.length;
  const valued = stopTiers.map(t => t != null);
  const firstValued = valued.indexOf(true);
  const lastValued = valued.lastIndexOf(true);
  if (firstValued < 0) return [];
  const tiers: Array<string | null> = stopTiers.map((t, i) => {
    if (t != null) return t;
    // A single valueless last stop is the terminal, not a tail (its departures are arrivals).
    const outer = i < firstValued || (i > lastValued && lastValued < n - 2);
    return outer ? 'infrequent' : null;
  });
  for (let i = 0; i < n; i++) {
    if (tiers[i] != null) continue;
    let prev = i - 1; while (prev >= 0 && tiers[prev] == null) prev--;
    let next = i + 1; while (next < n && tiers[next] == null) next++;
    const a = prev >= 0 ? tiers[prev] : null;
    const b = next < n ? tiers[next] : null;
    tiers[i] = a == null ? b : b == null ? a : worse(a, b);
  }
  const runs: SectionRun[] = [];
  for (let i = 0; i < n; i++) {
    const tier = tiers[i]!;
    const hw = headways[i] ?? null;
    const last = runs[runs.length - 1];
    if (last && last.tier === tier && last.to === i - 1) {
      last.to = i;
      if (hw != null) last.headway = Math.max(last.headway ?? 0, hw);
    } else {
      runs.push({ from: i, to: i, tier, headway: hw });
    }
  }
  return runs.filter(run => run.tier !== routeTier);
}

/** Start and end of a run as fractions of the line: half way to the neighbouring stops, the terminals at the stop itself. */
export function runExtent(stopPositions: readonly number[], from: number, to: number): [number, number] {
  const start = from > 0 ? (stopPositions[from] + stopPositions[from - 1]) / 2 : stopPositions[from];
  const end = to < stopPositions.length - 1 ? (stopPositions[to] + stopPositions[to + 1]) / 2 : stopPositions[to];
  return [start, end];
}

type Props = ShapeProperties & { agencySlug?: string };

function directionOf(p: Props): number {
  const n = Number(p.directionId);
  return p.directionId == null || !Number.isFinite(n) ? 0 : n;
}

interface Group { byDir: Map<number, Props[]>; candidates: Map<number, string[]>; byStop: Map<number, Map<string, Props[]>> }

/**
 * The per-stop section grade of one line: its own stop tier, or the worse of it and the best
 * opposite-direction grade at the matching stop (#821). Null where the stop has no grade.
 * Exported for tests.
 */
export function sectionTiers(
  p: Props,
  opposite: readonly Props[],
  coords: ReadonlyMap<string, { lat: number; lon: number }>,
  cache?: { candidates?: string[]; byStop?: Map<string, Props[]> },
): Array<string | null> {
  const stopOrder = p.stopOrder ?? [];
  const own = p.stopTiers ?? {};
  let candidates = cache?.candidates;
  if (!candidates) {
    const set = new Set<string>();
    for (const q of opposite) for (const s of q.stopOrder ?? []) set.add(s);
    candidates = [...set];
    if (cache) cache.candidates = candidates;
  }
  let byStop = cache?.byStop;
  if (!byStop) {
    byStop = new Map();
    for (const q of opposite) for (const s of q.stopOrder ?? []) byStop.set(s, [...(byStop.get(s) ?? []), q]);
    if (cache) cache.byStop = byStop;
  }
  return stopOrder.map(stopId => {
    const mine = own[stopId] ?? null;
    if (mine == null || candidates!.length === 0) return mine;
    const o = pairOppositeStop(stopId, candidates!, coords);
    if (o == null) return mine;
    let best: string | null = null;
    for (const q of byStop!.get(o) ?? []) {
      const t = q.stopTiers?.[o];
      if (t != null && (best == null || rank(t) < rank(best))) best = t;
    }
    return best == null ? mine : worse(mine, best);
  });
}

export function buildSectionColourFeatures(
  layers: Record<string, GeoJSON.FeatureCollection> | AgencyLayers | undefined,
  day: string | null,
  colorMode: ColorVisionMode = 'default',
  /** Keep only lines this accepts (the selected route is built from the unfiltered layers). */
  accept?: (p: { agencySlug: string; routeId: string; day: string | null }) => boolean,
): GeoJSON.Feature<GeoJSON.LineString, SectionColourProperties>[] {
  const out: GeoJSON.Feature<GeoJSON.LineString, SectionColourProperties>[] = [];
  if (!layers) return out;
  for (const [slug, collection] of Object.entries(layers)) {
    const coords = new Map<string, { lat: number; lon: number }>();
    const groups = new Map<string, Group>();
    const lines: Array<{ feature: GeoJSON.Feature; p: Props }> = [];
    for (const feature of collection.features) {
      const p = feature.properties as Props | null;
      if (!p) continue;
      if (feature.geometry.type === 'Point' && p.stopId != null) {
        const [lon, lat] = feature.geometry.coordinates;
        coords.set(String(p.stopId), { lat, lon });
        continue;
      }
      if (feature.geometry.type !== 'LineString' || p.stopId != null) continue;
      if (day != null && p.day != null && p.day !== day) continue;
      if (!p.stopOrder?.length || !p.stopPositions || p.stopPositions.length !== p.stopOrder.length || p.tier == null || !p.stopTiers) continue;
      if (accept && !accept({ agencySlug: p.agencySlug ?? slug, routeId: String(p.routeId), day: p.day ?? null })) continue;
      const key = `${p.routeId}|${p.day ?? ''}`;
      const group = groups.get(key) ?? { byDir: new Map(), candidates: new Map(), byStop: new Map() };
      const dir = directionOf(p);
      group.byDir.set(dir, [...(group.byDir.get(dir) ?? []), p]);
      groups.set(key, group);
      lines.push({ feature, p });
    }
    for (const { feature, p } of lines) {
      const group = groups.get(`${p.routeId}|${p.day ?? ''}`)!;
      const dir = directionOf(p);
      const opposite = [...group.byDir.entries()].filter(([d]) => d !== dir).flatMap(([, list]) => list);
      const cache = { candidates: group.candidates.get(dir), byStop: group.byStop.get(dir) };
      const tiers = sectionTiers(p, opposite, coords, cache);
      if (cache.candidates) group.candidates.set(dir, cache.candidates);
      if (cache.byStop) group.byStop.set(dir, cache.byStop);
      const headways = (p.stopOrder ?? []).map(stopId => p.stopHeadways?.[stopId] ?? null);
      for (const run of sectionRuns(tiers, p.tier!, headways)) {
        const [start, end] = runExtent(p.stopPositions!, run.from, run.to);
        const clipped = clipLinestring((feature.geometry as GeoJSON.LineString).coordinates, start, end);
        if (!clipped || clipped.length < 2) continue;
        out.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: clipped },
          properties: {
            color: getTierColor(run.tier, colorMode),
            tier: run.tier,
            headway: run.headway,
            agencySlug: p.agencySlug ?? slug,
            routeId: String(p.routeId),
            directionId: dir,
            headsign: p.headsign ?? null,
            day: p.day ?? null,
          },
        });
      }
    }
  }
  return out;
}

/** True when a selected-route key (`slug::routeId` or `slug::routeId::branch`) names this route. */
export function selectedRouteMatches(selectedRoute: string | null | undefined, agencySlug: string, routeId: string): boolean {
  if (!selectedRoute) return false;
  const [slug, id] = selectedRoute.split('::');
  return slug === agencySlug && id === routeId;
}
