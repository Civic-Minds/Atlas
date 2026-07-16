import { describe, expect, it } from 'vitest';
import { buildShape, pickBestShape, projectOntoShape, shapesFromGeometry } from '../shapeProjection';

// A straight ~1km east-west line at the equator, split into 100m segments.
const STRAIGHT_LINE: [number, number][] = Array.from({ length: 11 }, (_, i) => [i * 0.0009, 0]);

describe('projectOntoShape', () => {
  it('projects a point exactly on the line to the matching along-distance', () => {
    const shape = buildShape(STRAIGHT_LINE);
    const proj = projectOntoShape(shape, 0, STRAIGHT_LINE[5][0]);
    expect(proj).not.toBeNull();
    expect(proj!.along).toBeCloseTo(shape.cum[5], 0);
    expect(proj!.perpDistM).toBeCloseTo(0, 0);
  });

  it('interpolates along a segment instead of snapping to the nearest vertex', () => {
    const shape = buildShape(STRAIGHT_LINE);
    // Midpoint between vertex 3 and vertex 4.
    const midLon = (STRAIGHT_LINE[3][0] + STRAIGHT_LINE[4][0]) / 2;
    const proj = projectOntoShape(shape, 0, midLon);
    expect(proj).not.toBeNull();
    const expectedAlong = (shape.cum[3] + shape.cum[4]) / 2;
    expect(proj!.along).toBeCloseTo(expectedAlong, -1);
  });

  it('stays monotonic for points that move steadily forward, even off-line', () => {
    const shape = buildShape(STRAIGHT_LINE);
    const alongs: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const lon = i * 0.0001;
      const lat = 0.00002; // slightly off the line, simulating GPS noise
      const proj = projectOntoShape(shape, lat, lon);
      alongs.push(proj!.along);
    }
    for (let i = 1; i < alongs.length; i++) {
      expect(alongs[i]).toBeGreaterThanOrEqual(alongs[i - 1]);
    }
  });

  it('returns null for a degenerate single-point shape', () => {
    const shape = buildShape([[0, 0]]);
    expect(projectOntoShape(shape, 0, 0)).toBeNull();
  });
});

describe('shapesFromGeometry', () => {
  it('returns one shape for a LineString', () => {
    const shapes = shapesFromGeometry({ type: 'LineString', coordinates: STRAIGHT_LINE });
    expect(shapes).toHaveLength(1);
    expect(shapes[0].pts.length).toBe(STRAIGHT_LINE.length);
  });

  it('returns one shape per part for a MultiLineString', () => {
    const shapes = shapesFromGeometry({
      type: 'MultiLineString',
      coordinates: [STRAIGHT_LINE, STRAIGHT_LINE.slice(0, 5)],
    });
    expect(shapes).toHaveLength(2);
    expect(shapes[1].pts.length).toBe(5);
  });

  it('returns an empty array for unsupported geometry types', () => {
    expect(shapesFromGeometry({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
    expect(shapesFromGeometry(null)).toEqual([]);
  });
});

describe('pickBestShape', () => {
  it('picks the shape most samples actually match over a longer, unmatched one', () => {
    const mainline = buildShape(STRAIGHT_LINE);
    // A "spur" shape far away from where the real samples are.
    const spur = buildShape(STRAIGHT_LINE.map(([lon]) => [lon, 5]));
    const samples = STRAIGHT_LINE.map(([lon]) => ({ lat: 0, lon }));

    const best = pickBestShape([spur, mainline], s => s, samples, 50);
    expect(best).toBe(mainline);
  });

  it('returns the only candidate when there is just one', () => {
    const shape = buildShape(STRAIGHT_LINE);
    expect(pickBestShape([shape], s => s, [], 50)).toBe(shape);
  });

  it('returns null when there are no candidates', () => {
    expect(pickBestShape([], (s: ReturnType<typeof buildShape>) => s, [], 50)).toBeNull();
  });
});
