/**
 * CIV-1959 B3 (#1620, #1086): the shape of `pieceReadings`, the one field the pipeline writes (ATLAS_BRANCH_READINGS=1) and the
 * cards read (BRANCH_READINGS_ENABLED). Types and the stop lookup only; the words are in src/content/noticeCopy.ts.
 *
 * A direction's pieces are its trunk (the main stretch) and one piece per branch (a tail), today's boundaries (B4 changes them).
 * Each piece has one treatment per period:
 * - reading: the piece's own trips pass rule D (3 or more, evenly spaced, and no long wait at either edge): its reading `v`, shown as a line of its own.
 * - tail: 3 or more evenly spaced trips that stop or start inside the period (however short the run): it shows how often it
 *   runs (`every`) with when it stops (`until`) or starts (`from`), and carries its full-window wait as `v` (the longest wait
 *   a rider can have in the period, never lighter than that).
 * - limited: some trips, but too few or uneven. There is no coverage floor (Ryan). No number; it never sets any headline.
 * A period with no trips has no entry.
 */
import type { PeriodKey } from './rules/periods.js';

export type PieceTreatment =
  | { t: 'reading'; v: number }
  | { t: 'tail'; v: number; every: number; from?: number; until?: number }
  | { t: 'limited' };

export interface PieceReadingEntry {
  kind: 'trunk' | 'branch';
  /** 0 for the trunk; the branch's index in the direction's tails. */
  index: number;
  stopCount: number;
  refStop: string;
  /** The piece's stops in travel order. Only on the features whose own slot the piece is (as stretchMeta's rows are), so the file carries each list once. */
  stops?: string[];
  /** CIV-1959 #1636 (ATLAS_BRANCH_READINGS=1): the name of a branch no feature of its own stands for (its terminus: a headsign, else a stop name), on its entry on every feature of the direction. The card names its line from it. */
  to?: string;
  /** CIV-1959 #1636: for a branch that comes before the trunk (an origin leg) and has no feature of its own, the name of the stop it starts at; the card words it "from A to B". */
  from?: string;
  periods: Partial<Record<PeriodKey, PieceTreatment>>;
}

export interface PieceReadings {
  pieces: PieceReadingEntry[];
}

/** The piece (with its stop list) that holds a stop, among the readings of the features that serve it. Trunk first. */
export function pieceAtStop(readings: ReadonlyArray<PieceReadings | undefined>, stopId: string): PieceReadingEntry | null {
  let found: PieceReadingEntry | null = null;
  for (const r of readings) {
    for (const piece of r?.pieces ?? []) {
      if (!piece.stops?.includes(stopId)) continue;
      if (piece.kind === 'trunk') return piece;
      found ??= piece;
    }
  }
  return found;
}
