/**
 * Pieces (CIV-1959, #1620): the one place a route's pieces are defined.
 *
 * A piece is a stretch of a route direction that one set of trips serves: the trunk (the stops
 * every regular pattern shares), each branch (a tail off the trunk) and each short-turn segment.
 * This module is a wrapper, not new behaviour. It reads what the pipeline already decides:
 *
 * - who pools with whom at each stop: computeStopSharers (stopPools.ts), through patternPools;
 * - the trunk and the branches: directionStretches (tripSets.ts), through directionPieces
 *   (its `trunkStopMask` and the pooled `sharedStretches` are stamped from the same answers);
 * - the size minimum (5 stops, 1 km): PIECE_PARAMS (pieceParams.ts).
 *
 * Pools are directional. A same-headsign short turn pools on its own stops for the short turn
 * but only on the aligned run for the long pattern, so a piece keeps pools per owning pattern,
 * never one symmetric member list. Later commits build the reading rule on these pieces.
 */
import type { SharedStretchPattern } from './sharedStretch.js';
import { computeStopSharers, type StopSharers } from './stopPools.js';
import type { DirectionStretches, Stretch } from './tripSets.js';

export { PIECE_PARAMS } from './pieceParams.js';
import { PIECE_PARAMS } from './pieceParams.js';

export type PieceKind = 'trunk' | 'branch' | 'shortTurn';

/** owner pattern (memberKey) -> station key -> the other patterns pooled into the owner's departures there. May be asymmetric. */
export type PiecePools = ReadonlyMap<string, StopSharers>;

export interface Piece {
  kind: PieceKind;
  /** Travel order. */
  stops: readonly string[];
  lengthKm: number;
  /** The stop the piece is read at (the middle stop of the stretch). */
  refStop: string;
  /** Trips serving refStop. */
  tripCount: number;
  /** The stretch this piece was built from, so the existing readings stay reachable. */
  stretch: Stretch;
  /** Asymmetric pools of the patterns that run the piece, when known. */
  pools?: PiecePools;
}

/** Per pattern of one route direction and day, the patterns pooled at each station. Same answer as computeStopSharers. */
export function patternPools(
  patterns: readonly SharedStretchPattern[],
  stopsById: ReadonlyMap<string, { lat: number; lon: number }>,
  parentOf: ReadonlyMap<string, string>,
): PiecePools {
  return computeStopSharers(patterns, stopsById, parentOf);
}

/** Who is pooled into `owner`'s departures at `station`: asymmetric, so poolAt(a, s) can differ from the reverse. */
export function poolAt(pools: PiecePools, owner: string, station: string): ReadonlySet<string> {
  return pools.get(owner)?.get(station) ?? new Set<string>();
}

/** A trunk shorter than a branch may be (PIECE_PARAMS.minStops stops, minKm km) has no trunk value (CIV-1579). */
export function trunkLongEnough(main: Pick<Stretch, 'stops' | 'lengthKm'>): boolean {
  return main.stops.length >= PIECE_PARAMS.minStops && main.lengthKm >= PIECE_PARAMS.minKm;
}

/** The direction's trunk and its branches as pieces, trunk first. Short-turn segments are today's branches and pools; no separate state is read. */
export function directionPieces(d: Pick<DirectionStretches, 'main' | 'tails'>, pools?: PiecePools): Piece[] {
  const of = (kind: PieceKind, s: Stretch): Piece => ({ kind, stops: s.stops, lengthKm: s.lengthKm, refStop: s.refStop, tripCount: s.tripCount, stretch: s, pools });
  return [...(d.main ? [of('trunk', d.main)] : []), ...d.tails.map(t => of('branch', t))];
}
