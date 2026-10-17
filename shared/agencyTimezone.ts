/**
 * The agency's time zone after a feed is processed (CIV-251). A feed can carry a zone with the
 * same offset across a border (Gold Coast and Spokane write America/Vancouver, Washington County
 * writes America/Toronto); `timezoneOverride` in the agency config wins over the feed so a
 * corrected zone survives the next refresh. Otherwise the feed's zone, then the stored one.
 */
export function resolveAgencyTimezone(
  feedTimezone: string | null | undefined,
  agency: { timezone?: string | null; timezoneOverride?: string | null } | undefined,
): string | null {
  return agency?.timezoneOverride || feedTimezone || agency?.timezone || null;
}
