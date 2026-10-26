import type { ShapeProperties } from '../hooks/useIntervalStats';

type RowLike = Pick<ShapeProperties, 'headsign' | 'routeVariant' | 'stopOrder'>;

const FROM_VARIANT_RE = /^from\s+\S/i;

/** True when every row of one direction starts at the same first stop (one row counts as true). */
export function rowsShareOrigin(rows: RowLike[]): boolean {
  if (rows.length <= 1) return true;
  const first = rows[0].stopOrder?.[0];
  return first != null && rows.every(row => row.stopOrder?.[0] === first);
}

/**
 * A direction row's label with its origin, by Ryan's rule (2026-10-20): within one
 * direction, rows that all begin at the same stop read "to B via C" with no "from";
 * rows that begin at different stops read "from A to B via C", in plain words with
 * no separator. Only an origin the data names ("from A" route variant) is shown; a
 * row without one keeps its plain label. Other route variants keep the earlier
 * "variant · label" form when two rows share a destination.
 */
export function rowLabelWithOrigin(label: string, row: RowLike, directionRows: RowLike[]): string {
  const variant = row.routeVariant?.trim();
  if (variant && FROM_VARIANT_RE.test(variant)) {
    if (rowsShareOrigin(directionRows)) return label || variant;
    if (!label) return variant;
    return /^to\s/i.test(label) ? `${variant} ${label}` : `${variant} · ${label}`;
  }
  const headsignKey = (row.headsign ?? '').trim().toLowerCase();
  const sameDestinationCount = directionRows.filter(d => (d.headsign ?? '').trim().toLowerCase() === headsignKey).length;
  return sameDestinationCount > 1 && variant ? `${variant} · ${label}` : label;
}
