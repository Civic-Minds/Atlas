/**
 * CIV-1060: every hidden agency's card shows the same one sentence (docs/STYLE.md, "Agencies"), approved word for
 * word by Ryan (2026-11-13). Changing it needs his OK.
 *
 * An agency config marks the agency with `hiddenReason`, which says (for maintainers) why its data can't be shown;
 * the reason never changes the sentence. Engineering detail goes in the config's `internalNote`, which never reaches
 * the browser.
 */
export const HIDDEN_AGENCY_NOTE = 'Schedules for this agency aren’t available yet.';

/** Why a hidden agency's data can't be shown. Maintainer-facing only; every reason shows HIDDEN_AGENCY_NOTE. */
export const HIDDEN_AGENCY_REASONS = [
  /** HOCTS: no trip's service days match the calendar, so no trip has a day it runs. */
  'no-service-days',
  /** Roswell, Tangipahoa: the feed has no route shapes to draw. */
  'no-route-lines',
] as const;

export type HiddenAgencyReason = (typeof HIDDEN_AGENCY_REASONS)[number];

export function isHiddenAgencyReason(value: unknown): value is HiddenAgencyReason {
  return typeof value === 'string' && (HIDDEN_AGENCY_REASONS as readonly string[]).includes(value);
}

/** The note for an agency's `hiddenReason`, or null when it has none (or an unknown one). */
export function hiddenAgencyNoteFor(reason: unknown): string | null {
  return isHiddenAgencyReason(reason) ? HIDDEN_AGENCY_NOTE : null;
}
