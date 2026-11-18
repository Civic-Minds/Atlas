import { describe, expect, it } from 'vitest';
import type { LiveV3, WeekMetrics } from './liveDashboard';
import { routeBunching, routeReliability, RELIABILITY_DEFINITIONS } from './liveReliability';
import { LATE_ABOVE_MIN } from './rules/live';

const week = (late: number, bunched: number, gapped: number): WeekMetrics => ({
  days: 7, dates: ['2026-11-10'], healthyDates: ['2026-11-10'], late: { share: late, n: 500 },
  tripTime: { n: 400, scheduledMin: 20.8, typicalMin: 23.47, overMin: 2.7 }, extraWait: { minutes: 1.12, gaps: 300 },
  bunching: { share: bunched + gapped, gaps: 7000, bunched, gapped }, delivered: { share: 0.996, seen: 705, notSeen: 3, unknown: 0 },
});
const stop = (id: string, lateShare: number, ranked = true) => ({ stopId: id, name: `Stop ${id}`, directionId: 1, order: 1, n: 100, medianMin: 2.04, p90Min: 9, lateShare, earlyShare: 0, ranked });
const v3 = {
  window: { days: 15, dates: ['2026-11-02', '2026-11-10'], requestedDays: 15, goodDates: ['2026-11-10'] },
  directionLabels: { 0: 'Southbound', 1: 'Northbound' },
  weekly: { minHealthyDays: 4, health: [], comparable: true, thisWeek: week(0.165, 0.168, 0.094), lastWeek: week(0.161, 0.2, 0.1), bands: { pmPeak: { thisWeek: week(0.18, 0.192, 0.09), lastWeek: week(0.197, 0.23, 0.112) } } },
  bands: { all: { stops: [stop('a', 0.1), stop('b', 0.3), stop('c', 0.5, false), stop('d', 0.2), stop('e', 0.05)] }, pmPeak: { stops: [stop('b', 0.4)] } },
  bunching: [{ directionId: 1, bands: { pmPeak: { baselineBadShare: 0.208, kind: 'gradual', climb: 0.1, forms: null, biggestRise: { fromStopId: 'x', toStopId: 'y', fromName: 'X', toName: 'Y', rise: 0.073, fromBadShare: 0.2, toBadShare: 0.27, links: [] }, stops: [{ stopId: 's', name: 'S', order: 1, n: 50, badShare: 0.378, bunchedShare: 0.2, gappedShare: 0.178, medianGapSec: 300 }] } } }],
} as unknown as LiveV3;

describe('route reliability from the published Live summary (CIV-1860)', () => {
  it('takes each part of the day from the week comparison, with the shared definition of late', () => {
    const r = routeReliability(v3);
    expect(r.definitions.lateAboveMin).toBe(LATE_ABOVE_MIN);
    expect(r.dates).toEqual(['2026-11-10']);
    expect(r.bands.all?.thisWeek?.late).toEqual({ share: 0.165, departures: 500 });
    expect(r.bands.pmPeak?.lastWeek?.late?.share).toBe(0.197);
    expect(r.bands.all?.thisWeek?.tripTime).toEqual({ scheduledMin: 20.8, typicalMin: 23.5, trips: 400 });
    expect(r.bands.midday).toBeUndefined();
  });
  it('lists the ranked stops most often late, worst first, leaving out unranked ones', () => {
    expect(routeReliability(v3).bands.all?.lateStops.map(s => s.stopId)).toEqual(['b', 'd', 'a']);
    expect(routeReliability(v3).bands.all?.lateStops[0]).toMatchObject({ direction: 'Northbound', typicalDelayMin: 2 });
  });
  it('gives bunched and gapped as shares of the gaps, and where bunching rises most', () => {
    const b = routeBunching(v3).bands.pmPeak!;
    expect(b.thisWeek).toEqual({ badShare: 0.282, bunchedShare: 0.192, gappedShare: 0.09, gaps: 7000 });
    expect(b.byDirection[0]).toMatchObject({ direction: 'Northbound', startShare: 0.208, pattern: 'gradual', formsAt: { fromName: 'X', toName: 'Y', risePoints: 7.3 } });
    expect(b.byDirection[0].worstStops[0]).toMatchObject({ stopId: 's', typicalGapMin: 5 });
  });
  it('states no percentile figure', () => {
    expect(JSON.stringify([routeReliability(v3), routeBunching(v3)])).not.toMatch(/p90|p10/i);
    expect(Object.keys(RELIABILITY_DEFINITIONS)).toEqual(['lateAboveMin', 'earlyAtOrBelowMin', 'bunchedGapSec', 'gappedFactor']);
  });
});
