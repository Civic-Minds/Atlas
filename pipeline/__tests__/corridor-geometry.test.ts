import { describe, expect, it } from 'vitest';
import { clipLineBetweenStops } from '../geometry';

describe('clipLineBetweenStops', () => {
  it('keeps the shaped path between stops instead of drawing a chord', () => {
    const coords = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ];

    const clipped = clipLineBetweenStops(
      coords,
      { lat: 0, lon: 0 },
      { lat: 1, lon: 2 },
    );

    expect(clipped).toEqual(coords);
    expect(clipped).toHaveLength(4);
  });

  it('rejects stops that are not actually served by the candidate shape', () => {
    const clipped = clipLineBetweenStops(
      [[0, 0], [1, 0]],
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
    );

    expect(clipped).toBeNull();
  });
});
