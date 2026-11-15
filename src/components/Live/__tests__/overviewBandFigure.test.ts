import { describe, expect, it } from 'vitest';
import { bandFigure, figure } from '../overviewListModel';
import { lateShareColor } from '../lateShare';
import { cardTop } from '../cardPlacement';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import type { AgencyRouteRow } from '../../../../shared/liveAgency';

const wk = (late: number, typical: number, wait: number, bunch: number) => ({
  days: 7, dates: [], healthyDates: [], late: { share: late, n: 400 }, tripTime: { n: 500, scheduledMin: 99, typicalMin: 99, overMin: 0 },
  mainPatternTrip: { n: 150, scheduledMin: 53.4, typicalMin: typical, overMin: 0 }, extraWait: { minutes: wait, gaps: 1000 }, bunching: { share: bunch, gaps: 900 }, delivered: null,
});
// 504's week, trimmed to what the list reads: the whole day, and AM peak (CIV-1459).
const v3 = {
  weekly: {
    minHealthyDays: 4, health: [], comparable: true, thisWeek: wk(0.093, 50, 1, 0.282), lastWeek: wk(0.1, 50, 1, 0.3),
    bands: { amPeak: { thisWeek: wk(0.058, 50.4, 0.7, 0.21), lastWeek: wk(0.06, 51, 0.8, 0.2) } },
  },
} as unknown as LiveV3;
const row = { route: '504', lateShare: 0.093, runTimeOver: -0.07, runTimeDiffMin: -3, bunchingShare: 0.282 } as AgencyRouteRow;

describe('route list follows the time of day (#1150, CIV-1459)', () => {
  it('reads this week\'s figure for the picked period, the table\'s own', () => {
    expect(figure(row, v3, 'late', 'amPeak')).toEqual({ value: 0.058, text: '6%' });
    // Main patterns only: 50.4 typical vs 53.4 scheduled.
    expect(figure(row, v3, 'runTime', 'amPeak')?.value).toBe(-3);
    expect(figure(row, v3, 'extraWait', 'amPeak')?.value).toBeCloseTo(0.7);
    expect(figure(row, v3, 'bunching', 'amPeak')?.value).toBe(0.21);
  });

  it('never shows the whole day for a period the file has nothing for', () => {
    expect(bandFigure(v3, 'late', 'evening')).toBeNull();
    expect(figure(row, v3, 'bunching', 'evening')).toBeNull();
    expect(bandFigure(undefined, 'late', 'amPeak')).toBeNull();
  });
});

describe('late-by-hour colours match the map Late key (#1152)', () => {
  it('steps at 10% and 20%', () => {
    expect(lateShareColor(0.09)).toBe('var(--strip-delay-0)');
    expect(lateShareColor(0.12)).toBe('var(--strip-delay-1)');
    expect(lateShareColor(0.23)).toBe('var(--strip-delay-2)');
  });
});

describe('stop card stays inside the map (#1151)', () => {
  it('goes above the point when it fits, else below, else as low as keeps it whole', () => {
    expect(cardTop(400, 200, 600)).toBe(184);
    expect(cardTop(100, 200, 600)).toBe(116);
    expect(cardTop(150, 400, 470)).toBe(62);
  });
  it('keeps clear of the measure pills at the top and the key at the bottom', () => {
    // A stop high on a desktop map: below it, not over the pills.
    expect(cardTop(120, 100, 800, 56, 80)).toBe(136);
    // A stop low on a phone map: above it, not over the key.
    expect(cardTop(430, 180, 480, 76, 90)).toBe(234);
    // No room either side: as low as clears the key.
    expect(cardTop(200, 300, 480, 76, 90)).toBe(90);
  });
});
