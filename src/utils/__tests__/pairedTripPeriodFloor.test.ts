import { describe, it, expect } from 'vitest';
import { pairedTripPeriodFloor, pairedTripSafeHeadway, routeCardDisplayHeadway, routeListDisplayHeadway } from '../effectiveHeadway';
import { groupTrunkHeadway, medianTerminalHeadway } from '../routeCardTrunk';
import { branchDisplayHourHeadway, branchDisplayPeriodHeadway, buildRouteStopMetric, metricValueForPeriod } from '../routeFacts';
import { sparklineHeadwayByHour } from '../../components/Interval/panels/RouteCardHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { buildSharedStopIndex } from '../../../shared/sharedStops';

// Niagara 105 Saturday, release-mv5ilv73 (#761). Direction 0 runs paired trips 12 min apart,
// two an hour at midday, so every period median is 2 while the range and coverage read 30-60.
const niagara105Dir0 = {
  routeId: '105',
  routeShortName: '105',
  directionId: 0,
  day: 'Saturday',
  headsign: 'BROWN RD -  MT CARMEL PLAZA',
  tier: '60',
  serviceClass: 'regular',
  headway: 60,
  worstDirectionHeadway: 60,
  headwayByPeriod: { amPeak: 2, midday: 2, pmPeak: 2, evening: null, late: null, overnight: null },
  headwayByPeriodSustained: { amPeak: false, midday: false, pmPeak: false },
  periodCoverageHeadway: { amPeak: 55, midday: 58, pmPeak: 63, evening: null, late: null, overnight: 235 },
  worstDirectionPeriodCoverageHeadway: { amPeak: 60, midday: 60, pmPeak: 63, evening: null, late: null, overnight: null },
  maxGapByPeriod: { amPeak: 55, midday: 58, pmPeak: 28, evening: null, late: 180, overnight: 235 },
  headwayRangeByPeriod: { amPeak: { min: 30, max: 30 }, midday: { min: 30, max: 60 }, pmPeak: { min: 30, max: 30 }, evening: null, late: null, overnight: null },
  headwayByHour: { 6: 2, 7: 2, 8: 2, 9: 2, 14: 2, 15: 2, 16: 2, 17: 2 },
} as unknown as ShapeProperties;

const niagara105Dir1 = {
  ...niagara105Dir0,
  directionId: 1,
  headsign: 'BROWN RD -  CANADIAN DRIVE HUB',
  headwayByPeriod: { amPeak: 30, midday: 60, pmPeak: 30, evening: null, late: null, overnight: null },
  headwayByPeriodSustained: { amPeak: false, midday: true, pmPeak: true },
  periodCoverageHeadway: { amPeak: 60, midday: 60, pmPeak: 34, evening: null, late: null, overnight: null },
  maxGapByPeriod: { amPeak: 60, midday: 60, pmPeak: 30, evening: null, late: 180, overnight: 240 },
  headwayByHour: { 7: 30, 8: 30, 9: 30, 15: 30, 16: 30, 17: 30 },
} as unknown as ShapeProperties;

describe('paired-trip period floor (#761)', () => {
  it('route card shows the coverage value, not the paired-trip median', () => {
    expect(routeCardDisplayHeadway(niagara105Dir0, 'midday')).toBe(58);
    expect(routeCardDisplayHeadway(niagara105Dir0, 'amPeak')).toBe(55);
    expect(routeCardDisplayHeadway(niagara105Dir0, 'pmPeak')).toBe(63);
  });

  it('route lists and search no longer show every 2m', () => {
    // Lists show the map's number (CIV-237, slower direction #821): midday 60, AM 60.
    expect(routeListDisplayHeadway([niagara105Dir0, niagara105Dir1], 'midday')).toBe(60);
    expect(routeListDisplayHeadway([niagara105Dir0, niagara105Dir1], 'amPeak')).toBe(60);
  });

  it('raises hourly chart values inside the affected period only', () => {
    expect(pairedTripSafeHeadway(niagara105Dir0, 'midday', 2)).toBe(58);
    expect(pairedTripSafeHeadway(niagara105Dir0, null, 2)).toBe(2);
    expect(pairedTripSafeHeadway(niagara105Dir0, 'evening', 2)).toBe(2);
  });

  it('combined trunk value is not pulled down by a paired-trip branch', () => {
    expect(groupTrunkHeadway([niagara105Dir0], 'midday')).toBe(58);
  });

  it('leaves a sustained period alone', () => {
    expect(pairedTripPeriodFloor(niagara105Dir1, 'midday')).toBeNull();
    expect(routeCardDisplayHeadway(niagara105Dir1, 'midday')).toBe(60);
  });

  it('leaves a real short-span cadence alone when its range agrees with the median', () => {
    // A route running every 10 for part of the period: unsustained, large coverage, but the
    // typical-gap range confirms 10 is real. Riders still see every 10.
    const lateStart = {
      ...niagara105Dir0,
      headwayByPeriod: { amPeak: 10 },
      headwayByPeriodSustained: { amPeak: false },
      periodCoverageHeadway: { amPeak: 45 },
      maxGapByPeriod: { amPeak: 12 },
      headwayRangeByPeriod: { amPeak: { min: 9, max: 12 } },
    } as unknown as ShapeProperties;
    expect(pairedTripPeriodFloor(lateStart, 'amPeak')).toBeNull();
    expect(routeCardDisplayHeadway(lateStart, 'amPeak')).toBe(10);
  });

  it('does not guess without a typical-gap range', () => {
    // Known limit: without a range, a paired-trip median can't be told from a real short-span
    // cadence (TTC 22 Sunday AM, GRT 301 AM), so it is left for the pipeline fix.
    const noRange = { ...niagara105Dir0, headwayRangeByPeriod: undefined } as unknown as ShapeProperties;
    expect(routeCardDisplayHeadway(noRange, 'midday')).toBe(2);
  });
});

describe('paired-trip floor: fallback order and boundary (#761)', () => {
  const unsustained = (extra: Record<string, unknown>) => ({
    ...niagara105Dir0,
    headwayByPeriod: { midday: 2 },
    headwayByPeriodSustained: { midday: false },
    headwayRangeByPeriod: { midday: { min: 30, max: 60 } },
    periodCoverageHeadway: undefined,
    maxGapByPeriod: undefined,
    worstDirectionPeriodCoverageHeadway: undefined,
    ...extra,
  }) as unknown as ShapeProperties;

  it('uses own coverage, then longest gap, then worst direction, then the range minimum', () => {
    expect(pairedTripPeriodFloor(unsustained({
      periodCoverageHeadway: { midday: 58 }, maxGapByPeriod: { midday: 59 }, worstDirectionPeriodCoverageHeadway: { midday: 61 },
    }), 'midday')).toBe(58);
    expect(pairedTripPeriodFloor(unsustained({
      maxGapByPeriod: { midday: 59 }, worstDirectionPeriodCoverageHeadway: { midday: 61 },
    }), 'midday')).toBe(59);
    expect(pairedTripPeriodFloor(unsustained({ worstDirectionPeriodCoverageHeadway: { midday: 61 } }), 'midday')).toBe(61);
    expect(pairedTripPeriodFloor(unsustained({}), 'midday')).toBe(30);
  });

  it('fires when the median is exactly a third of the range minimum, not above it', () => {
    const at = unsustained({ headwayByPeriod: { midday: 10 }, periodCoverageHeadway: { midday: 40 } });
    expect(pairedTripPeriodFloor(at, 'midday')).toBe(40);
    const above = unsustained({ headwayByPeriod: { midday: 11 }, periodCoverageHeadway: { midday: 40 } });
    expect(pairedTripPeriodFloor(above, 'midday')).toBeNull();
  });
});

describe('paired-trip floor on hourly, trunk, stop and ranking surfaces (#761)', () => {
  it('sparkline caps Niagara 105 hours at the floored period value, not 2', () => {
    const byHour = sparklineHeadwayByHour([niagara105Dir0], [7, 9, 12, 15]);
    expect(byHour[7]).toBe(55);
    expect(byHour[9]).toBe(58);
    expect(byHour[15]).toBe(63);
    expect(byHour[12]).toBeNull();
  });

  it('hovered-hour row shows the floored value', () => {
    expect(branchDisplayHourHeadway(niagara105Dir0, 9)).toBe(58);
    expect(branchDisplayHourHeadway(niagara105Dir0, 15)).toBe(63);
    expect(branchDisplayHourHeadway(niagara105Dir1, 15)).toBe(30);
  });

  it('terminal median and combined trunk agree on the floored value', () => {
    expect(medianTerminalHeadway([niagara105Dir0], 'midday')).toBe(58);
    expect(groupTrunkHeadway([niagara105Dir0], 'midday')).toBe(58);
  });

  it('ranking by displayed value keeps a sustained every-30 variant ahead of a floored one', () => {
    expect(branchDisplayPeriodHeadway(niagara105Dir0, 'amPeak')).toBe(55);
    expect(branchDisplayPeriodHeadway(niagara105Dir1, 'amPeak')).toBe(30);
  });

  it('stop card at a Niagara 105 stop shows the floored value, not every 2 min', () => {
    const withStop = {
      ...niagara105Dir0,
      stopPeriodHeadways: { '6643': { amPeak: 2, midday: 2, pmPeak: 2 } },
      stopHeadways: { '6643': 2 },
    } as unknown as ShapeProperties;
    const service = buildRouteStopMetric(withStop, '6643');
    expect(metricValueForPeriod(service, 'midday')).toBe(58);
    expect(metricValueForPeriod(service, 'pmPeak')).toBe(63);
  });

  it('a stop already showing the real spacing keeps its own value', () => {
    // Niagara 105's own stops read 30/60/30 even though the feature median is 2.
    const withStop = {
      ...niagara105Dir0,
      stopPeriodHeadways: { '3011': { amPeak: 30, midday: 60, pmPeak: 30 } },
    } as unknown as ShapeProperties;
    const service = buildRouteStopMetric(withStop, '3011');
    expect(metricValueForPeriod(service, 'midday')).toBe(60);
    expect(metricValueForPeriod(service, 'amPeak')).toBe(30);
  });

  it('stop values on a direction with regular service are untouched', () => {
    const withStop = {
      ...niagara105Dir1,
      stopPeriodHeadways: { '1': { midday: 60, pmPeak: 30 } },
    } as unknown as ShapeProperties;
    expect(metricValueForPeriod(buildRouteStopMetric(withStop, '1'), 'pmPeak')).toBe(30);
  });
});

describe('paired-trip floor on shared stretches and the all-day stop value (#761)', () => {
  // Niagara-105-shaped pattern sharing a stretch (stops S1-S2) with a sibling pattern. The
  // pipeline pooled both patterns' departures there: midday every 8, all-day every 8.
  const pattern = {
    ...niagara105Dir0,
    stopOrder: ['S0', 'S1', 'S2'],
    sharedStretches: [{ from: 1, to: 2, with: ['SIBLING'] }],
    stopPeriodHeadways: { S0: { midday: 2 }, S1: { midday: 30 }, S2: { midday: 2 } },
    stopHeadways: { S0: 2, S1: 30, S2: 2 },
  } as unknown as ShapeProperties;
  const carrier = {
    ...pattern,
    headsign: 'SIBLING',
    sharedStops: {
      S1: { headway: 8, periods: [null, 8] },
      S2: { headway: 1, periods: [null, 1] },
    },
  } as unknown as ShapeProperties;
  const index = buildSharedStopIndex([{ properties: carrier }, { properties: pattern }]);

  it('a pooled value below the own value stays as published (combined service)', () => {
    const service = buildRouteStopMetric(pattern, 'S1', index);
    expect(service.provenance).toBe('shared-stretch');
    expect(metricValueForPeriod(service, 'midday')).toBe(8);
    expect(service.value).toBe(8);
  });

  it('a pooled value is not floored by this pattern alone', () => {
    const service = buildRouteStopMetric(pattern, 'S2', index);
    expect(metricValueForPeriod(service, 'midday')).toBe(1);
  });

  it('an own stop value off the shared stretch is floored, period and all-day', () => {
    const service = buildRouteStopMetric(pattern, 'S0', index);
    expect(service.provenance).toBe('stop-specific');
    expect(metricValueForPeriod(service, 'midday')).toBe(58);
    expect(metricValueForPeriod(service, 'all')).toBe(58);
  });

  it('all-day stop value already showing real spacing keeps its own value', () => {
    const regular = { ...niagara105Dir0, stopHeadways: { X: 60 }, stopPeriodHeadways: { X: { midday: 60 } } } as unknown as ShapeProperties;
    expect(metricValueForPeriod(buildRouteStopMetric(regular, 'X'), 'all')).toBe(60);
  });

  it('all-day stop value on a regular direction is untouched', () => {
    const regular = { ...niagara105Dir1, stopHeadways: { X: 20 } } as unknown as ShapeProperties;
    expect(metricValueForPeriod(buildRouteStopMetric(regular, 'X'), 'all')).toBe(20);
  });
});
