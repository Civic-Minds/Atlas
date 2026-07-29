import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { effectiveRouteHeadway } from './effectiveHeadway';

/** Numeric base + optional single letter suffix: 1, 1A, 23B — the GRTC-style variant pattern. */
const BASE_RE = /^(\d{1,3})([A-Z])$/;

/**
 * Same-agency routes whose short names match the lettered-variant shape (BASE_RE)
 * but aren't actually branches of one trunk route -- confirmed against the agency's
 * own published schedules. Keyed by `${agencySlug}::${base}`. Narrow, per-agency
 * exclusion rather than tightening BASE_RE/the matching logic itself, since this
 * heuristic is shared by every lettered-route agency (GRTC and others) and a naming
 * coincidence on one agency isn't evidence the general pattern is wrong (#294).
 */
const EXCLUDED_VARIANT_FAMILIES = new Set<string>([
  'windsor::1', // Transway 1A and 1C are separate routes sharing only a short downtown segment
]);

export interface VariantFamily {
  base: string;
  members: { shortName: string; routeId: string; headway: number | null }[];
  /** Combined frequency where the variants overlap: 1 / Σ(1/hᵢ). */
  combinedHeadwayMin: number | null;
}

/**
 * Detect lettered route variants of the same base (GRTC 1/1A/1B/1C style) among
 * one agency's features. Conservative: only numeric bases with single-letter
 * suffixes, and only when at least one lettered sibling exists.
 */
export function findVariantFamily(
  agencyFeatures: ShapeProperties[],
  shortName: string | null,
  period: TimePeriod,
  agencySlug?: string | null,
): VariantFamily | null {
  if (!shortName) return null;
  const m = shortName.match(BASE_RE) ?? (/^\d{1,3}$/.test(shortName) ? [shortName, shortName] : null);
  if (!m) return null;
  const base = m[1];
  if (agencySlug && EXCLUDED_VARIANT_FAMILIES.has(`${agencySlug}::${base}`)) return null;

  const byShort = new Map<string, { routeId: string; best: number | null }>();
  for (const p of agencyFeatures) {
    const sn = p.routeShortName;
    if (!sn || !p.routeId) continue;
    if (sn !== base && !(BASE_RE.test(sn) && sn.match(BASE_RE)![1] === base)) continue;
    const hw = effectiveRouteHeadway(p, period);
    const cur = byShort.get(sn);
    if (!cur) byShort.set(sn, { routeId: String(p.routeId), best: hw });
    else if (hw != null && (cur.best == null || hw < cur.best)) cur.best = hw;
  }

  if (byShort.size < 2) return null;
  if (![...byShort.keys()].some(sn => sn !== base)) return null;

  const members = [...byShort.entries()]
    .map(([sn, v]) => ({ shortName: sn, routeId: v.routeId, headway: v.best }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));

  let inv = 0, counted = 0;
  for (const mbr of members) {
    if (mbr.headway != null && mbr.headway > 0) { inv += 1 / mbr.headway; counted++; }
  }
  const combinedHeadwayMin = counted >= 2 && inv > 0 ? Math.round(1 / inv) : null;

  return { base, members, combinedHeadwayMin };
}
