import { cleanHeadsign, isMiwayExpressHeadsign } from './cleanHeadsign.js';

/** Cleaned destination equals the route title — hide on branch rows, not in stored data. */
export function isRedundantWithRouteName(
  cleaned: string,
  shortName: string | null,
  longName: string | null,
): boolean {
  const comparable = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalized = comparable(cleaned);
  if (longName && normalized === comparable(longName)) return true;
  if (shortName && longName) {
    const combo = `${shortName} ${longName}`;
    if (normalized === comparable(combo)) return true;
  }
  return false;
}

/**
 * Pipeline headsign for GeoJSON — never drop a GTFS headsign when cleaning strips too much.
 * Redundancy with route title is handled at display time (formatBranchLabel).
 */
export function resolveDisplayHeadsign(
  raw: string | null | undefined,
  shortName: string | null,
  longName: string | null,
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const cleaned = cleanHeadsign(trimmed, shortName, longName);
  if (cleaned) return cleaned;
  if (isMiwayExpressHeadsign(trimmed)) return null;
  return trimmed;
}

/**
 * The one name for a direction that has nothing better (CIV-1569): its bound label ("Westbound") when it has one, else
 * "Direction " + its number counted from 1, so GTFS direction 0 reads "Direction 1" and direction 1 "Direction 2".
 * Route card rows, the report's details and Live's direction names all use it; never write "Direction ${id}" by hand.
 */
export function directionBranchFallback(
  directionId: number,
  boundLabel?: string,
): string {
  return boundLabel ?? `Direction ${directionId + 1}`;
}
