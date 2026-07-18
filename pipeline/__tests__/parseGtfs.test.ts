import { describe, it, expect } from 'vitest';
import { truncateAtImplausibleJump } from '../parseGtfs.js';

describe('truncateAtImplausibleJump', () => {
  it('leaves a well-formed, evenly-spaced shape untouched', () => {
    const points: [number, number][] = [
      [43.65, -79.38], [43.651, -79.381], [43.652, -79.382], [43.653, -79.383], [43.654, -79.384],
    ];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });

  it('truncates at a single dramatic jump (Mi Transporte T14B_r2, #219)', () => {
    const points: [number, number][] = [
      [20.60, -103.38], [20.6005, -103.3805], [20.601, -103.381], [20.6015, -103.3815],
      [20.6058, -103.3850], // last good point before the jump
      [20.7541, -103.3591], // ~16.7km away — the corrupted jump
      [20.7545, -103.3595],
    ];
    const result = truncateAtImplausibleJump(points);
    expect(result).toEqual(points.slice(0, 5));
  });

  it('does not fire on naturally sparse shapes with no outlier (e.g. long rural rail segments)', () => {
    // Every segment is a similar, moderately large distance — no single segment
    // dominates relative to the others, so nothing should be truncated.
    const points: [number, number][] = [
      [43.0, -79.0], [43.05, -79.0], [43.10, -79.0], [43.15, -79.0], [43.20, -79.0],
    ];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });

  it('leaves short shapes (fewer than 4 points) untouched', () => {
    const points: [number, number][] = [[20.0, -103.0], [25.0, -108.0]];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });
});
