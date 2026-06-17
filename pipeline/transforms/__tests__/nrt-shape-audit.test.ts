import { describe, expect, it } from 'vitest';
import { shapesCompatible } from '../nrt-shape-audit';

describe('shapesCompatible', () => {
  const corridor: [number, number][] = [
    [43.1, -79.2],
    [43.15, -79.22],
    [43.16, -79.24],
  ];

  it('matches identical polylines', () => {
    expect(shapesCompatible(corridor, [...corridor])).toBe(true);
  });

  it('matches reversed polylines', () => {
    expect(shapesCompatible(corridor, [...corridor].reverse())).toBe(true);
  });

  it('matches same endpoints with different point density', () => {
    const dense: [number, number][] = [
      corridor[0],
      [43.12, -79.21],
      [43.14, -79.23],
      corridor[corridor.length - 1],
    ];
    expect(shapesCompatible(corridor, dense)).toBe(true);
  });

  it('rejects different corridors', () => {
    const other: [number, number][] = [
      [43.2, -79.3],
      [43.25, -79.32],
      [43.26, -79.34],
    ];
    expect(shapesCompatible(corridor, other)).toBe(false);
  });
});
