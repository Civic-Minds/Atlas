import { describe, it, expect } from 'vitest';
import { clipBetweenStopIndices, clipLinestring } from '../corridor-geometry';

describe('clipLinestring', () => {
  const line = [[0, 0], [1, 0], [2, 0], [3, 0]];

  it('returns middle segment', () => {
    const seg = clipLinestring(line, 0.25, 0.75);
    expect(seg!.length).toBeGreaterThanOrEqual(2);
    expect(seg![0]).toEqual([0.75, 0]);
    expect(seg!.at(-1)).toEqual([2.25, 0]);
  });
});

describe('clipBetweenStopIndices', () => {
  const coords = [[0, 0], [2, 0], [4, 0], [6, 0]];
  const positions = [0, 0.33, 0.66, 1];

  it('clips between stop indices', () => {
    const seg = clipBetweenStopIndices(coords, positions, 0, 2);
    expect(seg).not.toBeNull();
    expect(seg!.length).toBeGreaterThanOrEqual(2);
  });
});
