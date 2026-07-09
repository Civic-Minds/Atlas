import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { effectiveRouteHeadway } from './effectiveHeadway';

/** Numeric base + optional single letter suffix: 1, 1A, 23B — the GRTC-style variant pattern. */
const BASE_RE = /^(\d{1,3})([A-Z])$/;

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
): VariantFamily | null {
  if (!shortName) return null;
  const m = shortName.match(BASE_RE) ?? (/^\d{1,3}$/.test(shortName) ? [shortName, shortName] : null);
  if (!m) return null;
  const base = m[1];

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
