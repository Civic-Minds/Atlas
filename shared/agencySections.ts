/**
 * CIV-321: the beta section colours' data lives in a per-agency sections file
 * (`atlas/{slug}-sections.json`), not in the public route file, so public downloads do not grow.
 * The pipeline moves these fields off each route feature into the file (extractAgencySections); the
 * beta app puts them back on the matching features before building section colours
 * (applyAgencySections). Features are matched by route, direction, day, headsign, branch and variant,
 * numbered in file order where those repeat.
 */
export const SECTION_FIELDS = ['stretchStopPeriodValues', 'fullLine', 'fullStopOrder', 'fullStopPositions'] as const;

type Props = Record<string, unknown>;
type StretchMetaEntry = Record<string, unknown> & { period?: unknown; noRegular?: unknown; maxGap?: unknown };
type StretchMeta = { main: StretchMetaEntry | null; tails: StretchMetaEntry[] };

export interface AgencySectionEntry {
  stretchStopPeriodValues?: unknown;
  fullLine?: unknown;
  fullStopOrder?: unknown;
  fullStopPositions?: unknown;
  /** The stretch row values (stretchMeta's period and noRegular) of the tails. `main` is null in files written
   * since CIV-937, which keeps the main stretch's values on the route file; older files may still carry it. */
  stretchRows?: { main: { period?: unknown; noRegular?: unknown; maxGap?: unknown } | null; tails: Array<{ period?: unknown; noRegular?: unknown; maxGap?: unknown }> };
}

export interface AgencySections {
  /** Bumped when the entry shape changes. */
  version: 1;
  /** Fingerprint of the route file's feature keys: entries are matched by position among repeats, so a
   * sections file from another processing run must never be applied (applyAgencySections skips it). */
  routeKeys: string;
  sections: Record<string, AgencySectionEntry>;
}

/** A short FNV-1a hash of the route features' keys, in order. */
export function routeKeysFingerprint(keys: ReadonlyArray<string | null>): string {
  let h = 0x811c9dc5;
  const text = keys.map(k => k ?? '').join('\n');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${keys.filter(k => k != null).length}:${h.toString(16)}`;
}

/** The key of each route feature, in file order; stop features get null. */
export function sectionKeys(features: ReadonlyArray<{ geometry?: { type?: string } | null; properties?: Props | null }>): Array<string | null> {
  const seen = new Map<string, number>();
  return features.map(f => {
    const p = f.properties;
    // Every route feature, whatever its geometry (a route without a shape is drawn as a point).
    if (!p || p.stopId != null) return null;
    const base = [p.routeId, p.directionId, p.day, p.headsign, p.routeBranch, p.routeVariant].map(v => (v == null ? '' : String(v))).join('|');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** Moves the section fields off the features (in place) and returns the sections file. */
export function extractAgencySections(features: ReadonlyArray<{ geometry?: { type?: string } | null; properties?: Props | null }>): AgencySections {
  const keys = sectionKeys(features);
  const sections: Record<string, AgencySectionEntry> = {};
  features.forEach((f, i) => {
    const key = keys[i];
    const p = f.properties;
    if (!key || !p) return;
    const entry: AgencySectionEntry = {};
    for (const field of SECTION_FIELDS) {
      if (p[field] !== undefined) { (entry as Props)[field] = p[field]; delete p[field]; }
    }
    const meta = p.stretchMeta as StretchMeta | undefined;
    if (meta && typeof meta === 'object') {
      const split = (m: StretchMetaEntry | null) => {
        if (!m) return null;
        const row: { period?: unknown; noRegular?: unknown; maxGap?: unknown } = {};
        if (m.period !== undefined) { row.period = m.period; delete m.period; }
        if (m.noRegular !== undefined) { row.noRegular = m.noRegular; delete m.noRegular; }
        if (m.maxGap !== undefined) { row.maxGap = m.maxGap; delete m.maxGap; }
        return row;
      };
      // The main stretch's values stay on the route file: public route cards read them (CIV-937). Only the tails move.
      const main = null;
      const tails = meta.tails.map(t => split(t) ?? {});
      if (tails.some(t => Object.keys(t).length > 0)) entry.stretchRows = { main, tails };
    }
    if (Object.keys(entry).length > 0) sections[key] = entry;
  });
  return { version: 1, routeKeys: routeKeysFingerprint(keys), sections };
}

/** Puts the section fields back on matching features (new property objects; the input is not mutated).
 * A file whose fingerprint does not match these features is ignored. */
export function applyAgencySections<F extends { geometry?: { type?: string } | null; properties?: Props | null }>(features: readonly F[], file: AgencySections | null | undefined): F[] {
  if (!file?.sections || file.version !== 1) return [...features];
  const keys = sectionKeys(features);
  if (file.routeKeys !== routeKeysFingerprint(keys)) return [...features];
  return features.map((f, i) => {
    const entry = keys[i] ? file.sections[keys[i]!] : undefined;
    if (!entry || !f.properties) return f;
    const props: Props = { ...f.properties };
    for (const field of SECTION_FIELDS) if (entry[field] !== undefined) props[field] = entry[field];
    const meta = props.stretchMeta as StretchMeta | undefined;
    if (entry.stretchRows && meta) {
      props.stretchMeta = {
        main: meta.main ? { ...meta.main, ...(entry.stretchRows.main ?? {}) } : null,
        tails: meta.tails.map((t, j) => ({ ...t, ...(entry.stretchRows!.tails[j] ?? {}) })),
      };
    }
    return { ...f, properties: props };
  });
}
