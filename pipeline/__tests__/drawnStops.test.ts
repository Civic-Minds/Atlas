import { describe, expect, it } from 'vitest';
import { boardableDrawnStops, drawnStopsBeforeTerminal, headlineReadingStop } from '../drawnStops';

// CIV-994: the drawn-stop rules process-core applies, in one place.
describe('drawn stops that count', () => {
  it('before the terminal: a terminal drawn twice, platform then parent (MBTA 71 to Harvard), leaves both out', () => {
    expect(drawnStopsBeforeTerminal(['2074', '76124', 'place-harsq'], new Set(['76124', 'place-harsq']))).toEqual(['2074']);
  });

  it('before the terminal: a drop-off-only stop next to a boardable terminal goes with the terminal group', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c', 'd'], new Set(['c']))).toEqual(['a', 'b']);
  });

  it('before the terminal: a drop-off-only stop with a boardable stop after it, before the terminal, stays', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c', 'd'], new Set(['b']))).toEqual(['a', 'b', 'c']);
  });

  it('before the terminal: no drop-off-only stops leaves out just the last stop; empty and one-stop lists give none', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c'], new Set())).toEqual(['a', 'b']);
    expect(drawnStopsBeforeTerminal([], new Set())).toEqual([]);
    expect(drawnStopsBeforeTerminal(['a'], new Set())).toEqual([]);
  });

  it('boardable: every drop-off-only stop is left out (tier grading, #879)', () => {
    expect(boardableDrawnStops(['a', 'b', 'c'], new Set(['b', 'c']))).toEqual(['a']);
  });
});

describe('headlineReadingStop (CIV-1157)', () => {
  it('reads the last stop when a rider can board there', () => {
    expect(headlineReadingStop(['a', 'b', 'c'], new Set())).toBe('c');
    expect(headlineReadingStop(['a', 'b', 'c'], new Set(['b']))).toBe('c');
  });
  it('steps back from a drop-off-only end to the nearest boarding stop (CapMetro 985 southbound)', () => {
    expect(headlineReadingStop(['a', 'b', 'c'], new Set(['c']))).toBe('b');
    expect(headlineReadingStop(['a', 'b', 'c', 'd'], new Set(['c', 'd']))).toBe('b');
  });
  it('keeps the end when no drawn stop is boardable, and null on no stops', () => {
    expect(headlineReadingStop(['a', 'b'], new Set(['a', 'b']))).toBe('b');
    expect(headlineReadingStop([], new Set())).toBeNull();
  });
});
