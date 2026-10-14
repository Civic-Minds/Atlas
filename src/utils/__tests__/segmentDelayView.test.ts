import { describe, expect, it } from 'vitest';
import { formatMinutes, halfMinutes, rankSegments, segmentColor, tidyStopName, type SegmentDelayData } from '../segmentDelayView';

const stat = (gained: number, trips = 100) => ({
  trips, days: 10, firstDate: '2026-10-01', lastDate: '2026-10-10',
  actualMedianSec: 60 + gained, scheduledMedianSec: 60, gainedMedianSec: gained, gainedP90Sec: gained + 60,
});
const seg = (id: string, gained: number, extra: object = {}) => ({
  fromStopId: id, toStopId: `${id}2`, fromName: id, toName: id, directionId: 0, coordinates: [[0, 0], [1, 1]] as [number, number][],
  bands: { all: stat(gained) }, ...extra,
});

describe('segmentDelayView', () => {
  it('rounds to half minutes and words them plainly', () => {
    expect(halfMinutes(44)).toBe(1);
    expect(halfMinutes(20)).toBe(0.5);
    expect(formatMinutes(0.5)).toBe('½ min');
    expect(formatMinutes(2.5)).toBe('2½ min');
  });

  it('ranks losing stop pairs, lists padded ones separately, and drops thin or terminal pairs', () => {
    const data: SegmentDelayData = {
      agency: 'ttc', route: '504', generatedAt: '', dates: ['2026-10-01'], observations: 0,
      segments: [
        seg('a', 90), seg('b', 40), seg('c', 5), seg('d', -70),
        seg('thin', 200, { bands: { all: stat(200, 10) } }),
        seg('loop', 300, { terminal: true }),
      ],
    };
    const { losing, gaining } = rankSegments(data, 'all');
    expect(losing.map(s => s.segment.fromStopId)).toEqual(['a', 'b']);
    expect(gaining.map(s => s.segment.fromStopId)).toEqual(['d']);
  });

  it('colours with the existing lateness colours and leaves near-schedule pairs uncoloured', () => {
    expect(segmentColor(1.5)).toBe('#e53e3e');
    expect(segmentColor(0.5)).toBe('#f59e0b');
    expect(segmentColor(0)).toBeNull();
    expect(segmentColor(-1)).toBe('#3182ce');
  });

  it('title-cases all-caps stop names', () => {
    expect(tidyStopName('RONCESVALLES AVE AT QUEEN ST WEST')).toBe('Roncesvalles Ave at Queen St West');
    expect(tidyStopName('King St West at Bay St')).toBe('King St West at Bay St');
  });
});
