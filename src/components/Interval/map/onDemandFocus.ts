/**
 * Map focus for a selected on-demand service or zone. Mirrors fixed-route selection:
 * the selected zone and its stops stay at full strength, everything else fades.
 * Visibility (hours filtering) is decided before this runs, so focus never
 * brings back a zone or stop that isn't running.
 */

export interface OnDemandFocusTarget {
  slug: string;
  /** Zone id (areaName, or the polygon id when unnamed). Null = the whole service. */
  zoneId: string | null;
}

/** True when a zone polygon belongs to the focused selection. */
export function isOnDemandZoneFocused(
  target: OnDemandFocusTarget,
  agencySlug: string,
  zoneId: string | number | undefined,
): boolean {
  if (agencySlug !== target.slug) return false;
  if (target.zoneId === null) return true;
  return zoneId !== undefined && String(zoneId) === target.zoneId;
}

/** True when a stop or transfer point belongs to the focused selection. `zones` are the zones the stop is tied to. */
export function isOnDemandStopFocused(
  target: OnDemandFocusTarget,
  agencySlug: string,
  zones: readonly string[],
): boolean {
  if (agencySlug !== target.slug) return false;
  if (target.zoneId === null) return true;
  return zones.includes(target.zoneId);
}

/** Feature property the on-demand layers read to keep a feature at full strength while a selection is active. */
export const ON_DEMAND_FOCUSED_PROP = 'onDemandFocused';
