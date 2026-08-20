import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { effectiveRouteHeadway } from './effectiveHeadway';
import { hasSharedTrunk } from './routeBranchGeometry';

/** Numeric base + optional single letter suffix: 1, 1A, 23B — the GRTC-style variant pattern. */
const BASE_RE = /^(\d{1,3})([A-Z])$/;

/**
 * Same-agency routes whose short names match the lettered-variant shape (BASE_RE)
 * but aren't actually branches of one trunk route -- confirmed against the agency's
 * own published schedules. Keyed by `${agencySlug}::${base}`. Narrow, per-agency
 * exclusion rather than tightening BASE_RE/the matching logic itself, since this
 * heuristic is shared by every lettered-route agency (GRTC and others) and a naming
 * coincidence on one agency isn't evidence the general pattern is wrong (#294).
 *
 * This list is not a stand-in for a real geometry check pending automation -- it's the
 * permanent authority (#448). findVariantFamily also runs a geometry check (hasSharedTrunk)
 * below, but that only catches "these clearly don't share a path at all" cases. It can't
 * catch Windsor- or TheBus-style cases, where two genuinely distinct routes share a long real
 * downtown trunk (confirmed on live data: 14-50 shared stops, correct order) without being
 * branches of the same logical route -- geometry answers "do these paths overlap," not "is
 * this the same service." Keep entries here even after the geometry check exists.
 */
const EXCLUDED_VARIANT_FAMILIES = new Set<string>([
  'windsor::1', // Transway 1A and 1C are separate routes sharing only a short downtown segment
  'thebus::1', // TheBus (Honolulu) 1 and 1L are separate routes ("Kaimuki-Kalihi" vs "Hawaii Kai-Aloha Stadium Limited") -- confirmed via #303 sweep, base "1" exists on its own but that's not evidence either way (#294)
  'goraleigh::11', // GoRaleigh 11 and 11L are separate routes ("Avent Ferry" vs "Buck Jones Connector") -- confirmed via #303 sweep, same pattern as thebus::1
  'halifax::7', // 7A and 7B are clockwise/counterclockwise around the same loop, not corridor branches -- share zero real stops (confirmed against the agency's GTFS: only 2 stop overlaps, both at the terminal turning loop), so there is no valid combined-frequency figure between them (#335, #336)
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

  const byShort = new Map<string, { routeId: string; best: number | null; shapes: ShapeProperties[] }>();
  for (const p of agencyFeatures) {
    const sn = p.routeShortName;
    if (!sn || !p.routeId) continue;
    if (sn !== base && !(BASE_RE.test(sn) && sn.match(BASE_RE)![1] === base)) continue;
    const hw = effectiveRouteHeadway(p, period);
    const cur = byShort.get(sn);
    if (!cur) byShort.set(sn, { routeId: String(p.routeId), best: hw, shapes: [p] });
    else {
      if (hw != null && (cur.best == null || hw < cur.best)) cur.best = hw;
      cur.shapes.push(p);
    }
  }

  if (byShort.size < 2) return null;
  if (![...byShort.keys()].some(sn => sn !== base)) return null;

  const members = [...byShort.entries()]
    .map(([sn, v]) => ({ shortName: sn, routeId: v.routeId, headway: v.best }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));

  // Additional guard beyond the name pattern + exclusion list above: every other member must
  // share a real trunk with the (alphabetically) first member, same primitive as
  // shouldShowTrunkSummary's own first-vs-rest check (routeCardTrunk.ts). Catches future lettered
  // pairs that aren't yet a confirmed EXCLUDED_VARIANT_FAMILIES entry because nobody's found and
  // checked them -- see the comment on that list for what this can't catch on its own.
  const anchorShapes = byShort.get(members[0].shortName)!.shapes;
  for (let i = 1; i < members.length; i++) {
    const otherShapes = byShort.get(members[i].shortName)!.shapes;
    if (!hasSharedTrunk(anchorShapes, otherShapes)) return null;
  }

  let inv = 0, counted = 0;
  for (const mbr of members) {
    if (mbr.headway != null && mbr.headway > 0) { inv += 1 / mbr.headway; counted++; }
  }
  const combinedHeadwayMin = counted >= 2 && inv > 0 ? Math.round(1 / inv) : null;

  return { base, members, combinedHeadwayMin };
}
