import { describe, expect, it } from 'vitest';
import { pieceReadingEnabled } from '../../shared/rules/flags';
import { armAKeeps, listIsEvenAgainst, pieceReadingOverlay, readFeaturePieces, sharerPieces, type PieceReadContext } from '../pieces';

// CIV-1959 B2 (#1620, #1086): one reading per piece, with Arm A. A drifting stop is ignored for the piece, never overwritten.

const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };

/** One piece of `n` stops that one pattern pools with another; `lists[i]` is the pooled list at stop i. */
const piece = (lists: number[][]): PieceReadContext => {
  const order = lists.map((_, i) => `s${i}`);
  const pooled = new Map(order.map((s, i) => [s, lists[i]] as const));
  return {
    order, station: s => s,
    sharersAt: new Map(order.map(s => [s, new Set(['B'])] as const)),
    pooledMap: pooled, pooledStops: new Set(order), own: pooled, memberDeps: () => undefined,
  };
};
const cell = (ctx: PieceReadContext, stop: string, period = 'midday') => readFeaturePieces(ctx).find(c => c.stop === stop && c.period === period);

describe('one reading per piece, Arm A (CIV-1959 B2)', () => {
  const fifteens = () => Array.from({ length: 9 }, () => every(540, 900, 15));

  it('a drifting stop 16 among 15s: the piece shows 15, the stop is kept, its own value stays 16', () => {
    const lists = fifteens();
    lists[2] = every(540, 900, 16); // not the middle stop (index 4)
    const ctx = piece(lists);
    const c = cell(ctx, 's2')!;
    expect(c.pieceValue).toBe(15);
    expect(c.ownReading).toBe(16);
    expect(c.kept).toBe(true);
    const published = { s2: { midday: 16 }, s3: { midday: 15 } };
    const before = JSON.stringify(published);
    const overlay = pieceReadingOverlay(readFeaturePieces(ctx), published);
    expect(overlay).toEqual({ s2: { midday: 15 } }); // only the drifting stop differs from the piece
    expect(JSON.stringify(published)).toBe(before); // the stop's own published value is never written
  });

  it('a stop two tiers worse breaks off: it keeps its own value and gets no piece entry', () => {
    const lists = fifteens();
    lists[2] = every(540, 900, 30);
    const ctx = piece(lists);
    const c = cell(ctx, 's2')!;
    expect(c.pieceValue).toBe(15);
    expect(c.kept).toBe(false);
    expect(pieceReadingOverlay(readFeaturePieces(ctx), { s2: { midday: 30 } })).toEqual({});
  });

  it('one tier worse is ignored for the piece: a stop reading 20 among 15s is kept', () => {
    const lists = fifteens();
    lists[2] = every(540, 900, 20);
    const c = cell(piece(lists), 's2')!;
    expect(c.ownReading).toBe(20);
    expect(c.kept).toBe(true);
  });

  it('a stop that fails the evenness test breaks off even within one tier', () => {
    const uneven = { step: 1 as const, value: 18, list: [540, 555, 570, 585, 600, 640] };
    expect(listIsEvenAgainst(uneven.list, 15)).toBe(false); // 40 over max(1.6 x 15, 15 + 5)
    expect(armAKeeps(uneven, 15)).toBe(false);
    expect(armAKeeps({ step: 1, value: 16, list: every(540, 900, 16) }, 15)).toBe(true);
    expect(armAKeeps({ step: 0, value: null, list: [540, 560] }, 15)).toBe(false);
  });

  it('a stop with fewer than three departures has no reading and is not kept', () => {
    const lists = fifteens();
    lists[1] = [600, 700];
    const c = cell(piece(lists), 's1')!;
    expect(c.ownReading).toBeNull();
    expect(c.kept).toBe(false);
  });

  it('pieces break at a real trip-set change, not at a stop reading 16', () => {
    const order = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const sharersAt = new Map(order.map((s, i) => [s, new Set(i < 5 ? ['A'] : ['A', 'B'])] as const));
    const pieces = sharerPieces({ order, station: s => s, sharersAt, pooledStops: new Set(order) });
    expect(pieces).toEqual([order.slice(0, 5), order.slice(5)]);
    // A stop nothing pools at is in no piece.
    expect(sharerPieces({ order, station: s => s, sharersAt, pooledStops: new Set(order.filter(s => s !== 's2')) })).toEqual([['s0', 's1'], ['s3', 's4'], order.slice(5)]);
  });

  it('TTC 96-like: a 16 at the middle stop among 15s: the piece shows 15, the 16 is ignored and its own value stays 16', () => {
    const lists = fifteens();
    lists[4] = every(540, 900, 16); // the middle stop of nine
    const ctx = piece(lists);
    const c = cell(ctx, 's4')!;
    expect(c.pieceValue).toBe(15);
    expect(c.ownReading).toBe(16);
    expect(c.kept).toBe(true);
    expect(cell(ctx, 's0')!.pieceValue).toBe(15);
    const published = { s3: { midday: 15 }, s4: { midday: 16 } };
    expect(pieceReadingOverlay(readFeaturePieces(ctx), published)).toEqual({ s4: { midday: 15 } });
    expect(published.s4.midday).toBe(16);
  });

  it('an even count takes the upper median, never an arbitrary stop', () => {
    const lists = [every(540, 900, 15), every(540, 900, 20), every(540, 900, 15), every(540, 900, 20)];
    expect(cell(piece(lists), 's0')!.pieceValue).toBe(20);
  });

  it('a piece whose list is uneven reads its longest gap (step 4) and the reference stop breaks off', () => {
    const hole = [...every(540, 660, 15), ...every(840, 900, 15)]; // a 180-minute hole
    const lists = Array.from({ length: 5 }, () => hole);
    const c = cell(piece(lists), 's0')!;
    expect(c.step).toBe(4);
    expect(c.pieceValue).toBe(180);
  });

  it('two 30s three minutes apart read 27, never 15, and the reference stop breaks off', () => {
    const twoThirties = [...every(540, 900, 30), ...every(543, 900, 30)].sort((a, b) => a - b);
    const c = cell(piece(Array.from({ length: 5 }, () => twoThirties)), 's0')!;
    expect(c.pieceValue).toBeGreaterThanOrEqual(27);
    expect(c.pieceValue).not.toBe(15);
  });

  it('RTC 219-like 15/15/30 reads 20, as the pooled test does', () => {
    const list: number[] = []; for (let t = 540, i = 0; t <= 900; t += i % 3 === 2 ? 30 : 15, i++) list.push(t);
    const c = cell(piece(Array.from({ length: 5 }, () => list)), 's0')!;
    expect(c.pieceValue).toBe(20);
  });

  it('only the daytime periods and late are read: overnight is never stamped', () => {
    const ctx = piece(fifteens());
    expect(new Set(readFeaturePieces(ctx).map(c => c.period))).toEqual(new Set(['midday']));
  });

  it('switch off: only the exact string 1 turns it on', () => {
    expect(pieceReadingEnabled(undefined)).toBe(false);
    expect(pieceReadingEnabled('')).toBe(false);
    expect(pieceReadingEnabled('true')).toBe(false);
    expect(pieceReadingEnabled('1')).toBe(true);
  });
});
