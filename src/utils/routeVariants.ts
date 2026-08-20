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

  // Additional guard beyond the name pattern + exclusion list above: keep only the largest
  // group of members that actually share a real trunk with each other, dropping the rest,
  // rather than requiring every member to connect to one fixed anchor. GRTC's own route map
  // confirms why this has to be a real graph search and not "compare everyone to the first
  // member alphabetically": base route 1 (Chamberlayne, a separate northbound corridor) sorts
  // first, but the real trunk is 1A/1B/1C's shared "Core Route" south of downtown -- anchoring
  // on 1 would wrongly block the whole family instead of just dropping 1. Confirmed the same
  // shape on CTA 55/55A/55N (55 = Garfield, an unrelated corridor; 55A/55N share 55th Street).
  const n = members.length;
  const adjacency: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const connected = hasSharedTrunk(byShort.get(members[i].shortName)!.shapes, byShort.get(members[j].shortName)!.shapes);
      adjacency[i][j] = adjacency[j][i] = connected;
    }
  }
  const seen = new Array<boolean>(n).fill(false);
  const components: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const stack = [start];
    seen[start] = true;
    const component = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (let k = 0; k < n; k++) {
        if (!seen[k] && adjacency[cur][k]) {
          seen[k] = true;
          stack.push(k);
          component.push(k);
        }
      }
    }
    components.push(component);
  }
  const largestSize = Math.max(...components.map(c => c.length));
  const largest = components.filter(c => c.length === largestSize);
  // No group of 2+ members shares a real trunk, or two equally-sized candidate groups tie --
  // don't guess which one is the real family.
  if (largestSize < 2 || largest.length !== 1) return null;
  const keepIndices = new Set(largest[0]);
  const foldedMembers = members.filter((_, i) => keepIndices.has(i));

  let inv = 0, counted = 0;
  for (const mbr of foldedMembers) {
    if (mbr.headway != null && mbr.headway > 0) { inv += 1 / mbr.headway; counted++; }
  }
  const combinedHeadwayMin = counted >= 2 && inv > 0 ? Math.round(1 / inv) : null;

  return { base, members: foldedMembers, combinedHeadwayMin };
}
