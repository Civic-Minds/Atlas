import { describe, expect, it } from 'vitest';
import { lineModel, liveGaps, placeOnLine, runningTimeTally, stretchBetween, stripStops, withStats } from '../livePerformance';
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

  it('measures live gaps in minutes of typical running time, front car first', () => {
    const line = lineModel(data, 0)!;
    const stops = withStats(line, 'all');
    const now = 1_000_000;
    const g = liveGaps(data, line, stops, 'all', [
      { id: 'a', tripId: 't1', lat: LAT, lon: lon(3.5), tsEpoch: now }, // front: 3.5 stop pairs along
      { id: 'b', tripId: 't2', lat: LAT, lon: lon(1.5), tsEpoch: now }, // 2 stop pairs (4 min) behind
      { id: 'c', tripId: 'other', lat: LAT, lon: lon(1), tsEpoch: now }, // another direction's trip: ignored
      { id: 'd', tripId: 't3', lat: LAT, lon: lon(2), tsEpoch: now - 600 }, // stale: ignored
    ], now)!;
    expect(g.cars).toBe(2);
    expect(g.gapsMin).toEqual([4]);
    expect(g.scheduledSec).toBe(300);
  });

  it('marks the feed incomplete when a car on the section has a trip not in the timetable', () => {
    const line = lineModel(data, 0)!;
    const now = 1_000;
    const g = liveGaps(data, line, withStats(line, 'all'), 'all', [
      { id: 'a', tripId: 't1', lat: LAT, lon: lon(3.5), tsEpoch: now },
      { id: 'b', tripId: 't2', lat: LAT, lon: lon(1.5), tsEpoch: now },
      { id: 'x', tripId: 'unlisted', lat: LAT, lon: lon(2.5), tsEpoch: now },
    ], now)!;
    expect(g.incomplete).toBe(true);
  });

  it('marks the feed incomplete when fewer than half the scheduled cars are placed', () => {
    // 4 shared stop pairs of 10 min each, every 5 min: 8 cars expected, 2 placed.
    const slow = { ...data, segments: data.segments.map(s => ({ ...s, bands: { all: { ...s.bands.all!, actualMedianSec: 600 } } })) } as typeof data;
    const line = lineModel(slow, 0)!;
    const now = 1_000;
    const g = liveGaps(slow, line, withStats(line, 'all'), 'all', [
      { id: 'a', tripId: 't1', lat: LAT, lon: lon(3.5), tsEpoch: now },
      { id: 'b', tripId: 't2', lat: LAT, lon: lon(1.5), tsEpoch: now },
    ], now)!;
    expect(g.incomplete).toBe(true);
  });

  it('returns nothing with fewer than two placed cars', () => {
    const line = lineModel(data, 0)!;
    expect(liveGaps(data, line, withStats(line, 'all'), 'all', [{ id: 'a', tripId: 't1', lat: LAT, lon: lon(2), tsEpoch: 5 }], 5)).toBeNull();
  });
});
