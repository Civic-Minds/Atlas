/**
 * The one place the piece-size minimums live (CIV-1959, #1620).
 *
 * A run of stops is a piece of its own (a tail off the trunk, a pooled stretch) only when it is
 * at least `minStops` stops and `minKm` kilometres long. These were separate literals and
 * imports in sharedStretch, tripSets, convergingOrigins and the Live segment script; they are
 * gathered here with their values unchanged (5 stops, 1 km, D1 in docs/product/DECISIONS.md).
 * Nothing here is a new rule. A leaf module: it imports only the switch list, so any pipeline file can read it.
 *
 * CIV-1959 B4 (ATLAS_PIECES_BY_TRIPS=1, off by default): `pieceMinimum()` is the one place a size minimum is read. Off it is 5 stops
 * and 1 km, exactly as before; on it is 1 stop and 0 km, so a piece is whatever set of trips serves it (a one-stop branch counts).
 */
import { piecesByTripsEnabled } from '../shared/rules/flags.js';

export const PIECE_PARAMS = {
  /** A tail or pooled run needs at least this many stops... */
  minStops: 5,
  /** ...and at least this many kilometres. */
  minKm: 1,
  /** Converging origins (#879 class) must share at least this many stops; same number, its own rule. */
  convergingMinSharedStops: 5,
} as const;

/** The legacy minimum, kept explicit for code B4 does not move (buses_needed's vehiclePatterns.ts). */
export const LEGACY_PIECE_MINIMUM = { minStops: PIECE_PARAMS.minStops, minKm: PIECE_PARAMS.minKm } as const;
/** B4's minimum: none. A run is a piece because a set of trips serves it, not because it is long. */
export const BY_TRIPS_PIECE_MINIMUM = { minStops: 1, minKm: 0 } as const;

export interface PieceMinimum { readonly minStops: number; readonly minKm: number }

/** True when this process was started with ATLAS_PIECES_BY_TRIPS=1 (CIV-1959 B4). Off by default. */
export function piecesByTripsFromEnv(): boolean {
  return piecesByTripsEnabled(process.env.ATLAS_PIECES_BY_TRIPS);
}

/** The size minimum in force: 5 stops / 1 km, or none with ATLAS_PIECES_BY_TRIPS=1. */
export function pieceMinimum(): PieceMinimum {
  return piecesByTripsFromEnv() ? BY_TRIPS_PIECE_MINIMUM : LEGACY_PIECE_MINIMUM;
}
