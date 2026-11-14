/**
 * CIV-1060: every hidden-agency note comes from one pattern (docs/STYLE.md, "Agencies"):
 * "This agency’s [what] can’t be shown because its data [why]."
 *
 * An agency config names its reason in `hiddenReason`; the card shows the sentence built here. Each [what] and [why]
 * below was approved word for word by Ryan (2026-11-13). A new reason needs his OK on its wording before it goes here.
 * Engineering detail about a hidden agency goes in the config's `internalNote`, which never reaches the browser.
 */
export const HIDDEN_AGENCY_REASONS = {
  /** HOCTS: no trip's service days match the calendar, so no trip has a day it runs. */
  'no-service-days': { what: 'trips', why: 'doesn’t say which days they run' },
  /** Roswell, Tangipahoa: the feed has no route shapes to draw. */
  'no-route-lines': { what: 'route lines', why: 'doesn’t include them' },
} as const satisfies Record<string, { what: string; why: string }>;

export type HiddenAgencyReason = keyof typeof HIDDEN_AGENCY_REASONS;

/** The one sentence shape every hidden-agency note uses. */
export function hiddenAgencyNote(what: string, why: string): string {
  return `This agency’s ${what} can’t be shown because its data ${why}.`;
}

export function isHiddenAgencyReason(value: unknown): value is HiddenAgencyReason {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(HIDDEN_AGENCY_REASONS, value);
}

/** The note for an agency's `hiddenReason`, or null when it has none (or an unknown one). */
export function hiddenAgencyNoteFor(reason: unknown): string | null {
  if (!isHiddenAgencyReason(reason)) return null;
  const { what, why } = HIDDEN_AGENCY_REASONS[reason];
  return hiddenAgencyNote(what, why);
}
