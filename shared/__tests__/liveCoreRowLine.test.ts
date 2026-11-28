import { describe, expect, it } from 'vitest';
import { gapExtremes, liveGaps, rowLineModel, type RecentSnapshot } from '../liveCore';

/**
 * #1958: a card row measured along its own shape. TTC 504C replacement buses run on other streets than the analysis's
 * streetcar line, so on the direction's line every gap beside them was dropped and the row showed only the timetable.
 */
describe('rowLineModel (#1958)', () => {
  // A street 1.1 km long, east-west, well away from any other line.
  const shape: [number, number][] = [[-79.40, 43.65], [-79.39, 43.65]];
  const data = { agency: 'ttc', route: '504', generatedAt: '', dates: [], observations: 0, segments: [], tripDirections: { '1': ['a', 'b'] } } as never;
  // Car A moves east 1 m/s from 200 m; car B reaches 400 m now, where A was 200 s earlier... over 10 min of snapshots.
  const lonAt = (m: number) => -79.40 + (m / 1100) * 0.01;
  const snaps: RecentSnapshot[] = [];
  for (let t = 0; t <= 600; t += 30) {
    const v: RecentSnapshot['v'] = [['A', 'a', 43.65, lonAt(200 + t), t]];
    if (t >= 480) v.push(['B', 'b', 43.65, lonAt(400 - (600 - t) * 0.5), t]);
    snaps.push({ capturedAt: t, v });
  }
  it('measures the gap between two cars on the row\'s own street', () => {
    const g = liveGaps(data, rowLineModel(1, shape), [], 'all', snaps, 600, { wholeLine: true, countFewCars: true, rowSubset: true });
    expect(g?.cars).toBe(2);
    expect(g?.gapsMin).toEqual([7]);
    expect(gapExtremes({ gapsMin: g!.gapsMin, scheduledSec: 600 })?.longest.min).toBe(7);
  });
});
