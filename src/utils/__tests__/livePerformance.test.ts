import { describe, expect, it } from 'vitest';
import { lineModel, liveGaps, sharedSummary, placeOnLine, runningTimeTally, stretchBetween, stripStops, withStats } from '../livePerformance';
import type { SegmentDelayData, SegmentDelaySegment } from '../segmentDelayView';

// Five stops along latitude 43.65, ~800 m apart, westbound (direction 0).
const LAT = 43.65;
const lon = (i: number) => -79.36 - i * 0.01;
const band = (trips: number, actualSec: number, gainedSec = 0) => ({
  trips, days: 15, firstDate: 'a', lastDate: 'b', actualMedianSec: actualSec, scheduledMedianSec: actualSec - gainedSec, gainedMedianSec: gainedSec, gainedP90Sec: gainedSec + 20,
});
const seg = (i: number, trips: number, gained = 0): SegmentDelaySegment => ({
  fromStopId: `S${i}`, toStopId: `S${i + 1}`, fromName: `King St at Stop ${i}`, toName: `King St at Stop ${i + 1}`,
  directionId: 0, terminal: i === 0, bands: { all: band(trips, 120, gained) },
  coordinates: [[lon(i), LAT], [lon(i + 1), LAT]],
});
const gapStat = (sched: number, typical: number, p10: number, p90: number) => ({
  gaps: 100, days: 15, scheduledMedianGapSec: sched, actualMedianGapSec: typical, withinShare: 0.5, excessWaitSec: 60, gapP10Sec: p10, gapP90Sec: p90,
});
const data = {
  agency: 'ttc', route: '504', generatedAt: '', dates: Array.from({ length: 15 }, (_, i) => `d${i}`), observations: 0,
  directionLabels: { 0: 'Westbound' },
  // A branch stub (B1) with few trips must not become the line.
  segments: [seg(0, 600), seg(1, 600, 45), seg(2, 600), seg(3, 600), { ...seg(1, 50), toStopId: 'B1', toName: 'Branch at Stub' }],
  headways: [1, 2, 3].map(i => ({ stopId: `S${i}`, stopName: `King St at Stop ${i}`, directionId: 0, coordinates: [], bands: { all: gapStat(300, 240, 60, 600) } })),
  tripDirections: { 0: ['t1', 't2', 't3'], 1: ['other'] },
} as unknown as SegmentDelayData & { tripDirections: Record<string, string[]> };

describe('livePerformance', () => {
  it('follows the busiest stop pairs to build the line', () => {
    const line = lineModel(data, 0)!;
    expect(line.stops.map(s => s.stopId)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4']);
    expect(line.sharedStreet).toBe('King St');
  });

  it('keeps only measured stops in the strip, in line order', () => {
    const line = lineModel(data, 0)!;
    const rows = stripStops(withStats(line, 'all'));
    expect(rows.map(r => r.stopId)).toEqual(['S1', 'S2', 'S3']);
    expect(rows[0].stat!.gapP90Sec).toBe(600);
  });

  it('counts stop pairs within ½ min of the timetable, leaving line ends out', () => {
    const line = lineModel(data, 0)!;
    expect(runningTimeTally(line.segments, 'all')).toEqual({ within: 2, total: 3 });
  });

  it('builds a stretch with bounds covering its stop pairs', () => {
    const line = lineModel(data, 0)!;
    const st = stretchBetween(line, withStats(line, 'all'), 1, 3)!;
    expect(st.segments).toHaveLength(2);
    expect(st.bounds[0]).toBeCloseTo(lon(3));
    expect(st.bounds[2]).toBeCloseTo(lon(1));
  });

  it('places a point on the line and refuses one far off it', () => {
    const line = lineModel(data, 0)!;
    const p = placeOnLine(line, [(lon(2) + lon(3)) / 2, LAT])!;
    expect(p.segIndex).toBe(2);
    expect(p.frac).toBeCloseTo(0.5, 1);
    expect(placeOnLine(line, [lon(2), LAT + 0.01])).toBeNull();
  });

  // Snapshots once a minute; cars move one stop pair (0.01 deg lon) every 2 min.
  const snap = (t: number, cars: [string, string, number][]) => ({ capturedAt: t, v: cars.map(([id, trip, at]) => [id, trip, LAT, lon(at), t] as [string, string, number, number, number]) });

  it('measures how long ago the car ahead passed the car behind, front car first', () => {
    const line = lineModel(data, 0)!;
    const stops = withStats(line, 'all');
    const t0 = 10_000;
    // Car a passes stop position 2 at t0+240 s; car b is there at t0+480 s: a 4 min gap.
    const snaps = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => snap(t0 + k * 60, [
      ['a', 't1', 0 + k * 0.5],
      ...(k >= 4 ? [['b', 't2', (k - 4) * 0.5] as [string, string, number]] : []),
      ['c', 'other', 2], // the other direction's trip: ignored
    ]));
    const g = liveGaps(data, line, stops, 'all', snaps, t0 + 8 * 60)!;
    expect(g.incomplete).toBeUndefined();
    expect(g.cars).toBe(2);
    expect(g.gapsMin).toEqual([4]);
    expect(g.scheduledSec).toBe(300);
  });

  it('leaves a gap unknown when the car ahead was never seen passing', () => {
    const line = lineModel(data, 0)!;
    const t0 = 10_000;
    const snaps = [snap(t0, [['a', 't1', 3], ['b', 't2', 1.5]])];
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, t0)!.gapsMin).toEqual([null]);
  });

  it('uses the analysis\'s shared-section stops and tests sample minimums stop by stop', () => {
    const pooled = gapStat(300, 240, 60, 600);
    const withSection = { ...data, sharedSection: { 0: { stops: ['S1', 'S2', 'S3'], bands: { all: pooled } } } } as typeof data;
    const line = lineModel(withSection, 0)!;
    expect(line.stops.filter(s => s.shared).map(s => s.stopId)).toEqual(['S1', 'S2', 'S3']);
    expect(sharedSummary(withSection, line, 'all')).toBe(pooled);
    // Only 1 of 3 stops has enough gaps of its own: no header figures, however large the pooled count.
    const thin = { ...withSection, headways: withSection.headways!.map((h, i) => (i === 0 ? h : { ...h, bands: { all: { ...h.bands.all!, gaps: 10 } } })) } as typeof data;
    expect(sharedSummary(thin, lineModel(thin, 0)!, 'all')).toBeNull();
  });

  it('does not guess a passing time between reports more than 2½ min apart', () => {
    const line = lineModel(data, 0)!;
    const t0 = 10_000;
    // Car a reported at stop position 1 and next at 4, 5 min later; car b is now at 2.5.
    const snaps = [
      snap(t0, [['a', 't1', 1]]),
      snap(t0 + 300, [['a', 't1', 4], ['b', 't2', 2.5]]),
    ];
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, t0 + 300)!.gapsMin).toEqual([null]);
  });

  it('shows no gap rather than 0 when clocks disagree (car ahead passed "after" now)', () => {
    const line = lineModel(data, 0)!;
    const t0 = 10_000;
    const snaps = [
      { capturedAt: t0, v: [['a', 't1', LAT, lon(2), t0 + 30]] as [string, string, number, number, number][] },
      { capturedAt: t0 + 60, v: [['a', 't1', LAT, lon(3), t0 + 90], ['b', 't2', LAT, lon(2.5), t0 + 40]] as [string, string, number, number, number][] },
    ];
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, t0 + 60)!.gapsMin).toEqual([null]);
  });

  it('marks the feed incomplete when an unlisted car on the section has too few reports to place', () => {
    const line = lineModel(data, 0)!;
    const snaps = [snap(1_000, [['a', 't1', 3.5], ['b', 't2', 1.5], ['x', '-99', 2.5]])];
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, 1_000)!.incomplete).toBe(true);
  });

  it('measures staleness from each car\'s own report time', () => {
    const line = lineModel(data, 0)!;
    const t0 = 10_000;
    const snaps = [{ capturedAt: t0, v: [['a', 't1', LAT, lon(3), t0], ['b', 't2', LAT, lon(1.5), t0 - 200]] as [string, string, number, number, number][] }];
    // b's report is 200 s old: left out, leaving one car.
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, t0)).toBeNull();
  });

  it('marks the feed incomplete when the newest snapshot is old', () => {
    const line = lineModel(data, 0)!;
    const snaps = [snap(1_000, [['a', 't1', 3], ['b', 't2', 1.5]])];
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, 1_000 + 600)!.incomplete).toBe(true);
  });

  it('marks the feed incomplete when a moving car on the section has a trip whose direction can\'t be told', () => {
    const line = lineModel(data, 0)!;
    // Moving, but back and forth: direction can't be told.
    const snaps = [0, 1, 2].map(k => snap(1_000 + k * 60, [['a', 't1', 3.5], ['b', 't2', 1.5], ['x', 'unlisted', k === 1 ? 2.8 : 2.5]]));
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', snaps, 1_120)!.incomplete).toBe(true);
  });

  it('counts an unlisted car that is moving forward along this line, and ignores a parked one', () => {
    const line = lineModel(data, 0)!;
    const t0 = 10_000;
    const snaps = [0, 1, 2, 3].map(k => snap(t0 + k * 60, [
      ['a', 't1', 3 + k * 0.1],
      ['bus', '-123', 2 + k * 0.1], // unlisted, ~250 m forward in 3 min
      ['parked', '-456', 2.5], // unlisted, not moving
    ]));
    const g = liveGaps(data, line, withStats(line, 'all'), 'all', snaps, t0 + 180)!;
    expect(g.incomplete).toBeUndefined();
    expect(g.cars).toBe(2);
  });

  it('marks the feed incomplete when fewer than half the scheduled cars are placed', () => {
    // 4 shared stop pairs of 10 min each, every 5 min: 8 cars expected, 2 placed.
    const slow = { ...data, segments: data.segments.map(s => ({ ...s, bands: { all: { ...s.bands.all!, actualMedianSec: 600 } } })) } as typeof data;
    const line = lineModel(slow, 0)!;
    const snaps = [snap(1_000, [['a', 't1', 3.5], ['b', 't2', 1.5]])];
    expect(liveGaps(slow, line, withStats(line, 'all'), 'all', snaps, 1_000)!.incomplete).toBe(true);
  });

  it('returns nothing with fewer than two placed cars', () => {
    const line = lineModel(data, 0)!;
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', [snap(5, [['a', 't1', 2]])], 5)).toBeNull();
  });
});
