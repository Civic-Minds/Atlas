import { cleanHeadsign, isMiwayExpressHeadsign } from './cleanHeadsign.js';

/** Cleaned destination equals the route title — hide on branch rows, not in stored data. */
export function isRedundantWithRouteName(
  cleaned: string,
  shortName: string | null,
  longName: string | null,
): boolean {
  const lower = cleaned.toLowerCase().trim();
  if (longName && lower === longName.toLowerCase().trim()) return true;
  if (shortName && longName) {
    const combo = `${shortName.toLowerCase()} ${longName.toLowerCase()}`.trim();
    if (lower === combo) return true;
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

/** Fallback when a branch has headway but no displayable destination. */
export function directionBranchFallback(
  directionId: number,
  boundLabel?: string,
): string {
  return boundLabel ?? `Direction ${directionId + 1}`;
}
