import type { Agency } from '../App';
import type { ViewportBounds } from './useIntervalStats';
import type { AgencyLayers } from './useAgencyData';

/** Max non-corridor agency FeatureCollections held in React state at once. */
export const MAX_AGENCY_LAYERS_IN_REACT = 24;

function getAgencyBbox(agency: Agency): [number, number, number, number] {
  if (agency.bbox) return agency.bbox;
  const [lat, lon] = agency.center;
  const padLat = 0.35;
  const padLon = 0.45;
  return [lat - padLat, lon - padLon, lat + padLat, lon + padLon];
}

function bboxIntersects(bbox: [number, number, number, number], vp: ViewportBounds): boolean {
  const [s, w, n, e] = bbox;
  return !(n < vp.s || s > vp.n || e < vp.w || w > vp.e);
}

/**
 * Drop farthest-from-viewport agency layers when over the React memory cap.
 * Always keeps viewport-intersecting slugs and `pinned` (search / selection).
 * Corridor keys (`*-corridors`) are never pruned here (dropped with parent if present).
 * Returns null when no prune is needed.
 */
export function pruneAgencyLayers(
  layers: AgencyLayers,
  agencies: Agency[],
  bounds: ViewportBounds,
  pinned: Set<string>,
  max: number = MAX_AGENCY_LAYERS_IN_REACT,
): { layers: AgencyLayers; dropped: string[] } | null {
  const agencyKeys = Object.keys(layers).filter(k => !k.endsWith('-corridors'));
  if (agencyKeys.length <= max) return null;

  const bySlug = new Map(agencies.map(a => [a.slug, a]));
  const centerLat = (bounds.s + bounds.n) / 2;
  const centerLon = (bounds.w + bounds.e) / 2;

  const scored = agencyKeys.map(slug => {
    const agency = bySlug.get(slug);
    const mustKeep =
      pinned.has(slug) ||
      (agency ? bboxIntersects(getAgencyBbox(agency), bounds) : false);
    const dist = agency
      ? Math.hypot(agency.center[0] - centerLat, agency.center[1] - centerLon)
      : Infinity;
    return { slug, mustKeep, dist };
  });

  // Prefer dropping non-mustKeep farthest first
  scored.sort((a, b) => {
    if (a.mustKeep !== b.mustKeep) return a.mustKeep ? 1 : -1;
    return b.dist - a.dist; // farthest first among droppable
  });

  const dropCount = agencyKeys.length - max;
  const dropped: string[] = [];
  for (const row of scored) {
    if (dropped.length >= dropCount) break;
    if (row.mustKeep) continue;
    dropped.push(row.slug);
  }
  // If still over max (everything is mustKeep), drop farthest mustKeep except pinned
  if (agencyKeys.length - dropped.length > max) {
    const remaining = scored
      .filter(r => !dropped.includes(r.slug) && !pinned.has(r.slug))
      .sort((a, b) => b.dist - a.dist);
    for (const row of remaining) {
      if (agencyKeys.length - dropped.length <= max) break;
      dropped.push(row.slug);
    }
  }

  if (dropped.length === 0) return null;

  const dropSet = new Set(dropped);
  const next: AgencyLayers = {};
  for (const [key, fc] of Object.entries(layers)) {
    const base = key.endsWith('-corridors') ? key.slice(0, -10) : key;
    if (dropSet.has(base) || dropSet.has(key)) continue;
    next[key] = fc;
  }
  return { layers: next, dropped };
}
