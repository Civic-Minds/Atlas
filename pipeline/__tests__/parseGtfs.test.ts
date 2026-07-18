import { describe, it, expect } from 'vitest';
import { truncateAtImplausibleJump, deinterleaveDuplicateSequences } from '../parseGtfs.js';

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

describe('deinterleaveDuplicateSequences', () => {
  it('resolves duplicate sequence numbers by nearest-neighbor continuity (Mi Transporte T14B_r1, #244)', () => {
    // Two physical paths concatenated under one shape_id, each sequence number
    // duplicated once per path. A plain sort-by-sequence would zigzag between
    // them; nearest-neighbor selection should keep only one continuous path.
    const pts = [
      { seq: 0, lat: 20.00, lon: -103.00 },
      { seq: 0, lat: 20.40, lon: -103.00 }, // other path's point at same sequence
      { seq: 1, lat: 20.01, lon: -103.00 },
      { seq: 1, lat: 20.41, lon: -103.00 },
      { seq: 2, lat: 20.02, lon: -103.00 },
      { seq: 2, lat: 20.42, lon: -103.00 },
    ];
    expect(deinterleaveDuplicateSequences(pts)).toEqual([
      [20.00, -103.00],
      [20.01, -103.00],
      [20.02, -103.00],
    ]);
  });

  it('is a no-op (equivalent to a plain sort) when there are no duplicate sequences', () => {
    const pts = [
      { seq: 2, lat: 43.652, lon: -79.382 },
      { seq: 0, lat: 43.650, lon: -79.380 },
      { seq: 1, lat: 43.651, lon: -79.381 },
    ];
    expect(deinterleaveDuplicateSequences(pts)).toEqual([
      [43.650, -79.380],
      [43.651, -79.381],
      [43.652, -79.382],
    ]);
  });
});
