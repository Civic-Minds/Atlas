import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel } from '../routeCardRows';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

// TTC 29 Dufferin, weekday midday (#1185): two patterns run the whole main stretch every 16 each, together every 8.
const stops = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const pattern = (directionId: number, headsign: string, stopCount: number) => ({
  routeId: '29', routeShortName: '29', routeLongName: 'Dufferin', directionId, day: 'Weekday', headsign, tier: '15', headway: 16,
  stretchRole: 'main', stretchIndex: 0, stopOrder: stops(stopCount),
  headwayByPeriod: { midday: 16 }, headwayByPeriodSustained: { midday: true }, maxGapByPeriod: { midday: 16 },
  stretchMeta: { main: { stops: 45, refStop: '2083', trips: 41, period: { midday: 8 }, maxGap: { midday: 9 } }, tails: [] },
  directionFilterHeadwayByPeriod: { midday: 8 }, routeFilterHeadwayByPeriod: { midday: 8 },
}) as unknown as ShapeProperties;

function card(directions: ShapeProperties[]) {
  const current = { routeShortName: '29', routeLongName: 'Dufferin', directions };
  return buildRouteCardModel({
    directions, routeShortName: '29', routeLongName: 'Dufferin', directionGroups: buildDirectionGroups(current, 'midday'),
    agencyFeatures: undefined, period: 'midday', maxHeadway: 60, nightView: false, stableColors: false, hideSpan: false,
  });
}

describe('a main stretch several patterns share (#1185)', () => {
  it('two destinations: a "Shared stretch" row with the pooled value, each destination keeping its own', () => {
    const [group] = card([pattern(0, "Exhibition (Princes' Gates)", 49), pattern(0, 'Exhibition (Dufferin Gate)', 45)]).groups;
    expect(group.shared?.label).toBe('Shared stretch');
    expect(group.shared?.headway).toBe(8);
    expect(group.rows.map(r => r.display(null).value.headway)).toEqual([16, 16]);
  });
  it('the issue report states the card\'s Shared stretch value, not one of its own (#1230)', () => {
    const lines = card([pattern(0, "Exhibition (Princes' Gates)", 49), pattern(0, 'Exhibition (Dufferin Gate)', 45)]).reportServiceLines;
    expect(lines[0]).toBe('- Shared stretch every 8 min; each branch every 16 min');
    expect(lines.slice(1).every(line => line.endsWith(': every 16 min'))).toBe(true);
  });
  it('one destination: its one row reads the pooled value, with no 8-16 range', () => {
    const [group] = card([pattern(1, 'Wilson', 46), pattern(1, 'Wilson', 44)]).groups;
    expect(group.shared).toBeNull();
    expect(group.rows).toHaveLength(1);
    const value = group.rows[0].display(null).value;
    expect(value.headway).toBe(8);
    expect(value.trunkHeadway).toBeUndefined();
  });
  it('leaves the card alone when the pooled value is not materially better', () => {
    const a = { ...pattern(0, 'A', 30), stretchMeta: { main: { stops: 30, refStop: 'x', trips: 20, period: { midday: 14 } }, tails: [] } } as unknown as ShapeProperties;
    const b = { ...pattern(0, 'B', 28), stretchMeta: a.stretchMeta } as unknown as ShapeProperties;
    const [group] = card([a, b]).groups;
    expect(group.shared).toBeNull();
    expect(group.rows).toHaveLength(1);
  });
});
