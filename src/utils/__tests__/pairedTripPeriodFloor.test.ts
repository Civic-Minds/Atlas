import { describe, it, expect } from 'vitest';
import { pairedTripPeriodFloor, pairedTripSafeHeadway, routeCardDisplayHeadway, routeListDisplayHeadway } from '../effectiveHeadway';
import { groupTrunkHeadway } from '../routeCardTrunk';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

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
    expect(routeListDisplayHeadway([niagara105Dir0, niagara105Dir1], 'midday')).toBe(58);
    expect(routeListDisplayHeadway([niagara105Dir0, niagara105Dir1], 'amPeak')).toBe(30);
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
