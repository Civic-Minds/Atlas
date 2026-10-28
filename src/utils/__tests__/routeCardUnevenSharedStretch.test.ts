import { describe, expect, it } from 'vitest';
import { unevenPeriodMaxGap } from '../routeCardUneven';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const stops = Array.from({ length: 13 }, (_, i) => `s${i}`);
const filter = { amPeak: 15, midday: 18, pmPeak: 15, evening: null, late: null, overnight: null };

// Sun Metro 205 Mesa BRIO, weekday (CIV-939, #1103): direction 1 has 58 trips; 9 carry the headsign "Mesa Inbound",
// the rest are named for the last stop. Both draw the same 13 stops. The 9-trip feature's own midday gap is 315.
const outbound = {
  routeId: '205', routeShortName: '205', directionId: 0, day: 'Weekday', headsign: 'Mesa Outbound', tier: '20', headway: 18,
  stretchRole: 'main', stretchIndex: 0, stopOrder: stops,
  headwayByPeriod: { amPeak: 15, midday: 18, pmPeak: 15, evening: 18, late: null, overnight: null },
  headwayByPeriodSustained: { amPeak: true, midday: true, pmPeak: true, evening: false },
  maxGapByPeriod: { amPeak: 15, midday: 18, pmPeak: 18, evening: 18, late: 180, overnight: 220 },
  stretchMeta: { main: { stops: 13, refStop: '4157', trips: 55 }, tails: [] },
  directionFilterHeadwayByPeriod: filter, routeFilterHeadwayByPeriod: filter,
} as unknown as ShapeProperties;
const downtown = {
  routeId: '205', routeShortName: '205', directionId: 1, day: 'Weekday', headsign: 'Downtown Transit Ctr Bay O', tier: 'infrequent', headway: 18,
  stretchRole: 'main', stretchIndex: 0, stopOrder: stops,
  headwayByPeriod: { amPeak: 15, midday: 18, pmPeak: 15, evening: 18, late: null, overnight: null },
  headwayByPeriodSustained: { amPeak: true, midday: true, pmPeak: false, evening: false },
  maxGapByPeriod: { amPeak: 15, midday: 55, pmPeak: 72, evening: 18, late: 180, overnight: 220 },
  periodCoverageHeadway: { amPeak: 15, midday: 55, pmPeak: 72, evening: 107, late: null, overnight: 220 },
  stretchMeta: { main: { stops: 13, refStop: '4166', trips: 58 }, tails: [] },
  directionFilterHeadwayByPeriod: filter, routeFilterHeadwayByPeriod: filter,
} as unknown as ShapeProperties;
const mesaInbound = {
  routeId: '205', routeShortName: '205', directionId: 1, day: 'Weekday', headsign: 'Mesa Inbound', tier: 'span', headway: null,
  stretchRole: 'main', stretchIndex: 0, stopOrder: stops,
  headwayByPeriod: { amPeak: 15, midday: 15, pmPeak: 18, evening: null, late: null, overnight: null },
  headwayByPeriodSustained: { amPeak: false, midday: false, pmPeak: false },
  maxGapByPeriod: { amPeak: 15, midday: 315, pmPeak: 123, evening: null, late: 180, overnight: 240 },
  periodCoverageHeadway: { amPeak: null, midday: 315, pmPeak: 123, evening: null, late: null, overnight: null },
  stretchMeta: { main: { stops: 13, refStop: '4166', trips: 58 }, tails: [] },
  directionFilterHeadwayByPeriod: filter, routeFilterHeadwayByPeriod: filter,
} as unknown as ShapeProperties;

const gap = (directions: ShapeProperties[], period: 'midday' | 'pmPeak' = 'midday') =>
  unevenPeriodMaxGap(buildDirectionGroups({ directions }, period), period);

/** One main-stretch feature of a 30-minute route with a real 90-minute midday hole. */
function holey(headsign: string, extra: Partial<ShapeProperties> = {}): ShapeProperties {
  return {
    routeId: '9', routeShortName: '9', directionId: 0, day: 'Weekday', headsign, tier: '30', headway: 30,
    stretchRole: 'main', stretchIndex: 0, stopOrder: stops,
    headwayByPeriod: { midday: 30 }, headwayByPeriodSustained: { midday: false }, maxGapByPeriod: { midday: 90 },
    ...extra,
  } as unknown as ShapeProperties;
}

describe('uneven notice on a stretch shared by two headsigns (CIV-939)', () => {
  it('Sun Metro 205 midday: no 315-minute gap from the 9-trip headsign', () => {
    expect(gap([outbound, downtown, mesaInbound])).toBe(0);
  });

  it('the other headsign\'s gap, which leaves the 9 trips out, is not shown either', () => {
    expect(gap([outbound, downtown, mesaInbound], 'pmPeak')).toBe(0);
  });

  it('a single-headsign stretch with a real long gap still shows it', () => {
    expect(gap([holey('Downtown')])).toBe(90);
  });

  it('features sharing the stretch under the same headsign keep the gap (the pipeline reads the headsign\'s trips together)', () => {
    expect(gap([holey('Downtown'), holey('Downtown', { stopOrder: stops.slice(0, 12) })])).toBe(90);
  });

  it('another headsign whose only "gap" is the whole period (no departures inside it) leaves the gap alone', () => {
    const edgesOnly = holey('Express', { headway: 30, headwayByPeriod: { midday: null }, maxGapByPeriod: { midday: 360 }, stopOrder: stops.slice(0, 12) });
    expect(gap([holey('Downtown'), edgesOnly])).toBe(90);
  });

  it('another headsign that does not run in the period leaves the gap alone', () => {
    const peakOnly = holey('Express', { headway: 30, headwayByPeriod: { amPeak: 30, midday: null }, maxGapByPeriod: { amPeak: 30 }, stopOrder: stops.slice(0, 12) });
    expect(gap([holey('Downtown'), peakOnly])).toBe(90);
  });
});
