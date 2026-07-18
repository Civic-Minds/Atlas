import { describe, it, expect } from 'vitest';
import { truncateAtImplausibleJump, deinterleaveDuplicateSequences, detectClusteredJumps } from '../parseGtfs.js';

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

describe('detectClusteredJumps', () => {
  it('flags a real repro from Nancy Réseau Stan shape 10757$STAN-56$14: two sub-paths interleaved via unique (non-duplicate) sequence numbers', () => {
    // Leading/trailing filler at the shape's real ~26m median spacing, so the
    // median (computed across the whole shape) isn't skewed by this short
    // excerpt the way it would be with just the 22-point repro alone -- matches
    // how the real 446-point shape behaves (median stays small, jumps stand out).
    const filler: [number, number][] = Array.from({ length: 30 }, (_, i) => [48.678 + i * 0.00023, 6.160 + i * 0.00023]);
    // Points 283-296 exactly as published (sorted by their real, distinct shape_pt_sequence
    // values) -- no duplicates to key off of, but the path still zigzags: north (283-285),
    // snaps back ~250m south then east (286-294), snaps back north again (295-296).
    const points: [number, number][] = [
      ...filler,
      [48.68177032470703, 6.16294002532959],
      [48.681907653808594, 6.163816928863525],
      [48.68208694458008, 6.165071964263916],
      [48.68211364746094, 6.165280818939209],
      [48.68215560913086, 6.165363788604736],
      [48.68218231201172, 6.165460109710693],
      [48.682220458984375, 6.1656951904296875],
      [48.68230438232422, 6.166211128234863],
      [48.682273864746094, 6.166215896606445],
      [48.68454360961914, 6.168026924133301], // jump north
      [48.686790466308594, 6.168015956878662], // jump further north
      [48.68354797363281, 6.168540954589844], // snaps back south
      [48.68381118774414, 6.17014217376709],
      [48.683937072753906, 6.170985221862793],
      [48.6840934753418, 6.171936988830566],
      [48.68427276611328, 6.172421932220459],
      [48.68458557128906, 6.173192977905273],
      [48.68466567993164, 6.173373222351074],
      [48.684730529785156, 6.173602104187012],
      [48.68476867675781, 6.1738200187683105],
      [48.6883544921875, 6.173195838928223], // jumps north again
      [48.69043731689453, 6.175655841827393],
    ];
    expect(detectClusteredJumps(points)).toBe(true);
  });

  it('does not flag a well-formed shape with consistent spacing', () => {
    const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [43.65 + i * 0.0003, -79.38 + i * 0.0003]);
    expect(detectClusteredJumps(points)).toBe(false);
  });

  it('does not flag a single isolated long segment (a real long block or highway stretch)', () => {
    const points: [number, number][] = Array.from({ length: 15 }, (_, i) => [43.65 + i * 0.0003, -79.38 + i * 0.0003]);
    points[8] = [43.68, -79.38]; // one big jump, not a clustered zigzag
    expect(detectClusteredJumps(points)).toBe(false);
  });
});
