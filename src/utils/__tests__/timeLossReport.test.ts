import { describe, expect, it } from 'vitest';
import { timeLossReport } from '../timeLossReport';
import { timeLossMarkdown } from '../../../scripts/live-time-loss-report';
import type { SegmentBandStat, SegmentDelayData, SegmentDelaySegment } from '../segmentDelayView';

const stat = (gainedMedianSec: number, gainedP90Sec: number, trips = 40, days = 6): SegmentBandStat => ({
  trips, days, firstDate: '2026-10-01', lastDate: '2026-10-08', actualMedianSec: 100 + gainedMedianSec, scheduledMedianSec: 100, gainedMedianSec, gainedP90Sec,
});
const seg = (from: string, to: string, midday: SegmentBandStat, extra: Partial<SegmentDelaySegment> = {}): SegmentDelaySegment => ({
  fromStopId: from, toStopId: to, fromName: `Stop ${from}`, toName: `Stop ${to}`, directionId: 0, bands: { midday }, coordinates: [], ...extra,
});
const data = (segments: SegmentDelaySegment[]): SegmentDelayData => ({
  agency: 'ttc', route: '504', generatedAt: '', dates: ['2026-10-01', '2026-10-08'], directionLabels: { 0: 'Eastbound' }, observations: 0, segments,
});
const midday = (segments: SegmentDelaySegment[]) => timeLossReport(data(segments), ['midday']).bands.midday![0];

describe('timeLossReport', () => {
  it('ranks stop pairs by typical extra running time, largest first, and flags amber from 30 s and red from 60 s', () => {
    const d = midday([seg('a', 'b', stat(45, 80)), seg('b', 'c', stat(95, 150)), seg('c', 'd', stat(60, 60)), seg('d', 'e', stat(29, 200))]);
    expect(d.slower.map(r => [r.fromStopId, r.level])).toEqual([['b', 'red'], ['c', 'red'], ['a', 'amber']]);
    expect(d.measured).toBe(4);
    expect(d.label).toBe('Eastbound');
  });
  it('needs 30 trips over 5 days, and leaves out stop pairs at the main pattern ends', () => {
    const d = midday([seg('a', 'b', stat(90, 120, 29, 9)), seg('b', 'c', stat(90, 120, 300, 4)), seg('c', 'd', stat(90, 120), { terminal: true }), seg('d', 'e', stat(90, 120, 30, 5))]);
    expect(d.slower.map(r => r.fromStopId)).toEqual(['d']);
    expect(d.tooFewPasses).toBe(2);
    expect(d.patternEnds).toBe(1);
  });
  it('rounds the typical value to nearest half minute and the 1-in-10 down, showing it only when greater', () => {
    const [r] = midday([seg('a', 'b', stat(74, 119))]).slower;
    expect(r.typicalMin).toBe(1); // 74 s -> 1 min (nearest)
    expect(r.p90MinDown).toBe(1.5); // 119 s -> 1.5 min (down)
    expect(r.showP90).toBe(true);
    const [s] = midday([seg('a', 'b', stat(80, 89))]).slower;
    expect(s.typicalMin).toBe(1.5); // 80 s -> 1.5 min
    expect(s.p90MinDown).toBe(1); // 89 s -> 1 min, not shown: not greater than the typical value as shown
    expect(s.showP90).toBe(false);
  });
  it('lists at most two looser-than-needed stop pairs, only when 9 in 10 are at or under the timetable', () => {
    const d = midday([seg('a', 'b', stat(-40, 0)), seg('b', 'c', stat(-90, -10)), seg('c', 'd', stat(-60, -5)), seg('d', 'e', stat(-100, 5)), seg('e', 'f', stat(-29, -10))]);
    expect(d.looser.map(r => r.fromStopId)).toEqual(['b', 'c']);
    expect(d.slower).toEqual([]);
  });
  it('writes the card wording, with the sample on every figure and none of the banned words', () => {
    const md = timeLossMarkdown(timeLossReport(data([seg('a', 'b', stat(74, 119)), seg('b', 'c', stat(-60, -5))]), ['midday']));
    expect(md).toContain('Takes 1 min longer than scheduled; 1 in 10 take 1.5+ min longer | 40 trips, 6 days');
    expect(md).toContain('The schedule allows 1 min more than vehicles need (40 trips, 6 days)');
    expect(md).not.toMatch(/\blate\b|delay of|at least|\bearly\b/i);
  });
});
