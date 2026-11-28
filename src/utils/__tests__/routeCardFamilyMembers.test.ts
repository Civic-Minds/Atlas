import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

// #1818: GRTC 1A, 1B and 1C, weekday PM peak. The card folds the family into one card ("Includes variants 1A, 1B, 1C");
// each member route has its own main stretch, every 30.
const stops = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const member = (routeId: string, directionId: number, headsign: string, stopCount: number) => ({
  routeId, routeShortName: routeId, directionId, day: 'Weekday', headsign, tier: '30', headway: 30,
  stretchRole: 'main', stretchIndex: 0, stopOrder: stops(stopCount),
  headwayByPeriod: { pmPeak: 30 }, headwayByPeriodSustained: { pmPeak: true }, maxGapByPeriod: { pmPeak: 30 },
  stretchMeta: { main: { stops: stopCount, refStop: `${routeId}-ref`, trips: 16, period: { pmPeak: 30 }, maxGap: { pmPeak: 30 } }, tails: [] },
  directionFilterHeadwayByPeriod: { pmPeak: 30 }, routeFilterHeadwayByPeriod: { pmPeak: 30 },
}) as unknown as ShapeProperties;

describe('a folded lettered family keeps every member route\'s rows (#1818)', () => {
  it('shows 1B and 1C beside 1A, not only the member with the most stops', () => {
    const directions = [
      member('1A', 0, 'Chesterfield Walmart via Midlothian', 61),
      member('1B', 0, 'Midlothian Giant Dr via Warwick', 45),
      member('1C', 0, 'Chippenham Mall via Hull', 44),
    ];
    const [group] = buildDirectionGroups({ directions }, 'pmPeak');
    expect(group.realTier.map(d => d.routeShortName).sort()).toEqual(['1A', '1B', '1C']);
  });

  it('keeps two members apart when they share a destination', () => {
    const directions = [member('1B', 1, 'Downtown Transfer Station', 40), member('1C', 1, 'Downtown Transfer Station', 42)];
    const [group] = buildDirectionGroups({ directions }, 'pmPeak');
    expect(group.realTier.map(d => d.routeShortName).sort()).toEqual(['1B', '1C']);
  });
});
