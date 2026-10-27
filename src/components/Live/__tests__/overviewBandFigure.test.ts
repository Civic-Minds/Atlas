import { describe, expect, it } from 'vitest';
import { bandFigure, figure } from '../overviewListModel';
import { lateShareColor } from '../lateShare';
import { cardTop } from '../cardPlacement';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import type { AgencyRouteRow } from '../../../../shared/liveAgency';

// 504's figures from its analysis file (data up to Oct 16), trimmed to what the list reads.
const v3 = {
  bands: {
    all: { adherence: { timepoints: { all: { overall: { n: 2566, lateShare: 0.093 } } } } },
    amPeak: { adherence: { timepoints: { all: { overall: { n: 433, lateShare: 0.058 } } } } },
  },
  runningTime: { patterns: {
    0: [{ kind: 'main', bands: { amPeak: { n: 75, scheduledMin: 52.9, typicalMin: 49.3 } } }, { kind: 'branch', bands: { amPeak: { n: 40, scheduledMin: 50, typicalMin: 60 } } }],
    1: [{ kind: 'main', bands: { amPeak: { n: 82, scheduledMin: 53.9, typicalMin: 51 } } }],
  } },
  extraWait: { amPeak: [{ gaps: 100, extraWaitMin: 1 }, { gaps: 300, extraWaitMin: 0.6 }] },
  weekly: { thisWeek: { extraWait: { minutes: 1, gaps: 91922 } } },
} as unknown as LiveV3;
const row = { route: '504', lateShare: 0.093, runTimeOver: -0.07, runTimeDiffMin: -3, bunchingShare: 0.282 } as AgencyRouteRow;

describe('route list follows the time of day (#1150)', () => {
  it('reads the picked period for Late, Run time and Extra wait', () => {
    expect(figure(row, v3, 'late', 'amPeak')).toEqual({ value: 0.058, text: '6%' });
    // Main patterns only, both directions weighted by trips: 50.2 typical vs 53.4 scheduled; the branch is left out.
    expect(figure(row, v3, 'runTime', 'amPeak')?.value).toBe(-3);
    expect(figure(row, v3, 'extraWait', 'amPeak')?.value).toBeCloseTo(0.7);
  });

  it('keeps the all-day figures for All day, and Bunching all day', () => {
    expect(figure(row, v3, 'late', 'all')).toEqual({ value: 0.093, text: '9%' });
    expect(figure(row, v3, 'bunching', 'amPeak')?.value).toBe(0.282);
  });

  it('has no figure for a period the file has nothing for', () => {
    expect(bandFigure(v3, 'late', 'evening')).toBeNull();
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
});
