import { describe, expect, it } from 'vitest';
import { kpiDelta, kpiTiles, lateForDays, weekCaption } from '../liveKpi';
import { dailyNoise } from '../../../shared/liveDashboard';
import type { LiveV3 } from '../../../shared/liveDashboard';

describe('kpiDelta', () => {
  it('colours only changes bigger than the fixed amount for each figure', () => {
    expect(kpiDelta('late', 0.21, 0.2, true, true)).toMatchObject({ text: '▲ 1 pt', tone: 'same' });
    expect(kpiDelta('delivered', 0.997, 0.998, false, true)).toMatchObject({ text: '▼ 0.1 pt', tone: 'same' });
    expect(kpiDelta('late', 0.25, 0.2, true, true)).toMatchObject({ tone: 'worse' });
    expect(kpiDelta('late', 0.15, 0.2, true, true)).toMatchObject({ tone: 'better' });
    expect(kpiDelta('delivered', 0.97, 0.99, false, true)).toMatchObject({ tone: 'worse' });
    expect(kpiDelta('tripTime', 28, 30, true, false)).toMatchObject({ text: '▼ 2 min', tone: 'better' });
  });
  it('says same when nothing changed and nothing when a week is missing', () => {
    expect(kpiDelta('late', 0.2, 0.2, true, true)).toMatchObject({ text: 'same', tone: 'same' });
    expect(kpiDelta('late', 0.2, null, true, true)).toBeNull();
  });
});

describe('kpiTiles', () => {
  const week = (late: number, delivered: number, dates: string[]) => ({ days: 7, dates, healthyDates: dates, late: { share: late, n: 900 }, tripTime: { n: 40, scheduledMin: 30, typicalMin: 31, overMin: 1 }, extraWait: { minutes: 1.2, gaps: 500 }, bunching: { share: 0.2, gaps: 600 }, delivered: { share: delivered, seen: 990, notSeen: 10, unknown: 0 } });
  const w: NonNullable<LiveV3['weekly']> = { minHealthyDays: 5, health: [], thisWeek: week(0.21, 0.997, ['2026-10-08', '2026-10-14']), lastWeek: week(0.2, 0.998, ['2026-10-01', '2026-10-07']), comparable: true };
  it('makes the five tiles with sample sizes and no colour for small moves', () => {
    const tiles = kpiTiles(w);
    expect(tiles.map(t => t.label)).toEqual(['Late', 'Run time', 'Extra wait', 'Bunching', 'Service delivered']);
    expect(tiles[0]).toMatchObject({ value: '21%', n: 900, delta: { text: '▲ 1 pt', tone: 'same' } });
    expect(tiles[4]).toMatchObject({ value: '99.7%', delta: { text: '▼ 0.1 pt', tone: 'same' } });
  });
  it('drops the change chips when the weeks are not comparable', () => {
    expect(kpiTiles({ ...w, comparable: false }).every(t => t.delta == null)).toBe(true);
    expect(weekCaption({ ...w, comparable: false })).toMatch(/Not enough days/);
  });
});

describe('lateForDays', () => {
  // 2026-10-10 and 2026-10-11 are a Saturday and Sunday; 2026-10-14 has gaps in the recordings.
  const byDate = [
    { date: '2026-10-09', n: 100, late: 10 }, { date: '2026-10-10', n: 100, late: 30 },
    { date: '2026-10-11', n: 100, late: 20 }, { date: '2026-10-14', n: 100, late: 90 },
  ];
  const healthy = ['2026-10-09', '2026-10-10', '2026-10-11'];
  it('counts only days with good recordings, so All days matches the Late tile', () => {
    expect(lateForDays(byDate, healthy, 'all')).toEqual({ share: 0.2, n: 300, days: 3 });
    expect(lateForDays(byDate, healthy, 'weekday')).toEqual({ share: 0.1, n: 100, days: 1 });
    expect(lateForDays(byDate, healthy, 'weekend')).toEqual({ share: 0.25, n: 200, days: 2 });
  });
  it('is empty when no day of that kind is left', () => {
    expect(lateForDays(byDate, ['2026-10-09'], 'weekend')).toBeNull();
  });
});

describe('dailyNoise', () => {
  it('is 2 x the standard error of the difference of two weekly means, from the day-to-day spread', () => {
    // sd of [0.1, 0.2, 0.3] is 0.1; 2 * 0.1 * sqrt(1/3 + 1/3)
    expect(dailyNoise([0.1, 0.2, 0.3], 3, 3)).toBeCloseTo(0.1633, 4);
    expect(dailyNoise([0.1, 0.2], 2, 2)).toBeNull();
  });
  it('greys a change inside the day-to-day spread and colours one outside it, and says so on hover', () => {
    const noisy = dailyNoise([0.07, 0.33, 0.1, 0.11, 0.13, 0.1], 6, 7)!;
    expect(kpiDelta('late', 0.25, 0.2, true, true, noisy)).toMatchObject({ tone: 'same', spoken: expect.stringMatching(/usual day-to-day/) });
    expect(kpiDelta('late', 0.25, 0.2, true, true, 0.02)).toMatchObject({ tone: 'worse', spoken: expect.stringMatching(/bigger change than usual day to day/) });
  });
  it('leaves out a tile with no figure this week', () => {
    const week = (dates: string[]) => ({ days: 7, dates, healthyDates: dates, late: { share: 0.1, n: 900 }, tripTime: null, extraWait: null, bunching: { share: 0.2, gaps: 600 }, delivered: null });
    const w: NonNullable<LiveV3['weekly']> = { minHealthyDays: 4, health: [], thisWeek: week(['2026-10-08']), lastWeek: week(['2026-10-01']), comparable: true };
    expect(kpiTiles(w).map(t => t.label)).toEqual(['Late', 'Bunching']);
  });
});
