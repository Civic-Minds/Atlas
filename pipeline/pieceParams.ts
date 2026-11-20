/**
 * The one place the piece-size minimums live (CIV-1959, #1620).
 *
 * A run of stops is a piece of its own (a tail off the trunk, a pooled stretch) only when it is
 * at least `minStops` stops and `minKm` kilometres long. These were separate literals and
 * imports in sharedStretch, tripSets, convergingOrigins and the Live segment script; they are
 * gathered here with their values unchanged (5 stops, 1 km, D1 in docs/product/DECISIONS.md).
 * Nothing here is a new rule. A leaf module: it imports nothing, so any pipeline file can read it.
 */
export const PIECE_PARAMS = {
  /** A tail or pooled run needs at least this many stops... */
  minStops: 5,
  /** ...and at least this many kilometres. */
  minKm: 1,
  /** Converging origins (#879 class) must share at least this many stops; same number, its own rule. */
  convergingMinSharedStops: 5,
} as const;
