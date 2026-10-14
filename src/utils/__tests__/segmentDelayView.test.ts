import { describe, expect, it } from 'vitest';
import { formatMinutes, halfMinutes, halfMinutesDown, plural, rankSegments, segmentColor, tidyStopName, type SegmentDelayData } from '../segmentDelayView';

const stat = (gained: number, trips = 100, p90 = gained + 60) => ({
  trips, days: 10, firstDate: '2026-10-01', lastDate: '2026-10-10',
  actualMedianSec: 60 + gained, scheduledMedianSec: 60, gainedMedianSec: gained, gainedP90Sec: p90,
});
const seg = (id: string, gained: number, extra: object = {}) => ({
  fromStopId: id, toStopId: `${id}2`, fromName: id, toName: id, directionId: 0, coordinates: [[0, 0], [1, 1]] as [number, number][],
  bands: { all: stat(gained) }, ...extra,
});

describe('segmentDelayView', () => {
  it('rounds to half minutes and words them plainly', () => {
    expect(halfMinutes(44)).toBe(0.5);
    expect(halfMinutes(46)).toBe(1);
    expect(halfMinutesDown(75)).toBe(1);
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(2, 'day')).toBe('2 days');
    expect(formatMinutes(0.5)).toBe('½ min');
    expect(formatMinutes(2.5)).toBe('2½ min');
  });

  it('ranks losing stop pairs, lists padded ones separately, and drops thin or terminal pairs', () => {
    const data: SegmentDelayData = {
      agency: 'ttc', route: '504', generatedAt: '', dates: ['2026-10-01'], observations: 0,
      segments: [
        seg('a', 90), seg('b', 40), seg('c', 15), seg('d', -70, { bands: { all: stat(-70, 100, -10) } }),
        seg('mixed', -60, { bands: { all: stat(-60, 100, 120) } }),
        seg('fewdays', 200, { bands: { all: { ...stat(200), days: 2 } } }),
        seg('thin', 200, { bands: { all: stat(200, 10) } }),
        seg('loop', 300, { terminal: true }),
      ],
    };
    const { losing, gaining } = rankSegments(data, 'all');
    expect(losing.map(s => s.segment.fromStopId)).toEqual(['a', 'b']);
    expect(gaining.map(s => s.segment.fromStopId)).toEqual(['d']);
  });

  it('colours by raw seconds with the existing lateness colours', () => {
    const item = (gained: number, p90 = gained + 60) => ({ segment: seg('x', gained), stat: stat(gained, 100, p90), lostMin: halfMinutes(gained) });
    expect(segmentColor(item(90))).toBe('#e53e3e');
    expect(segmentColor(item(40))).toBe('#f59e0b');
    expect(segmentColor(item(15))).toBeNull(); // would round to ½ min, but under the 30 s bar
    expect(segmentColor(item(-60, -10))).toBe('#3182ce');
    expect(segmentColor(item(-60, 120))).toBeNull(); // typical pass is early, but 1 in 10 run 2 min over
  });

  it('title-cases all-caps stop names', () => {
    expect(tidyStopName('RONCESVALLES AVE AT QUEEN ST WEST')).toBe('Roncesvalles Ave at Queen St West');
    expect(tidyStopName('King St West at Bay St')).toBe('King St West at Bay St');
  });
});
