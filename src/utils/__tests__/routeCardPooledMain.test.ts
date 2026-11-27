import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel } from '../routeCardRows';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import it9x from './fixtures/intercitytransit-9x-weekday.json';
import rtd15 from './fixtures/rtd-15-weekday.json';
import go40 from './fixtures/go-40-weekday.json';
import broome35 from './fixtures/broome-35-saturday.json';
import { PUBLIC_TIER_MAXES } from '../../../shared/rules/frequency';

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
  // #1909: Intercity Transit 9X westbound, weekday PM peak. Two headsigns alternate on one path (every 30 each, every 15
  // together), and a 5-trip "Capital Mall" span pattern runs the same stops with no wait of its own.
  it('patterns on the same stops under different headsigns are one destination, read at the pooled value (#1909)', () => {
    const evergreen = pattern(1, 'Capital Mall-The Evergreen State College', 22);
    const courthouse = pattern(1, 'Capital Mall - County Courthouse', 22);
    const span = { ...pattern(1, 'Capital Mall', 22), tier: 'span', headway: null, headwayByPeriod: { midday: null },
      headwayByPeriodSustained: {}, periodCoverageHeadway: { midday: 227 }, maxGapByPeriod: { midday: 13 } } as unknown as ShapeProperties;
    const [group] = card([evergreen, courthouse, span]).groups;
    expect(group.shared).toBeNull();
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].display(null).value.headway).toBe(8);
  });
  it('different stops under different headsigns stay two destinations', () => {
    const a = { ...pattern(0, 'Hawks Prairie', 22), stopOrder: stops(22) } as ShapeProperties;
    const b = { ...pattern(0, 'Lacey Transit Center', 22), stopOrder: stops(22).map(s => `${s}b`) } as unknown as ShapeProperties;
    const [group] = card([a, b]).groups;
    expect(group.shared?.headway).toBe(8);
    expect(group.rows).toHaveLength(2);
  });
  it('leaves the card alone when the pooled value is not materially better', () => {
    const a = { ...pattern(0, 'A', 30), stretchMeta: { main: { stops: 30, refStop: 'x', trips: 20, period: { midday: 14 } }, tails: [] } } as unknown as ShapeProperties;
    const b = { ...pattern(0, 'B', 28), stretchMeta: a.stretchMeta } as unknown as ShapeProperties;
    const [group] = card([a, b]).groups;
    expect(group.shared).toBeNull();
    expect(group.rows).toHaveLength(1);
  });
});

// Published weekday features (release-mwyirpo2): Intercity Transit 9X and RTD 15.
function publishedCard(directions: ShapeProperties[], period: 'amPeak' | 'midday' | 'pmPeak') {
  const name = directions[0].routeShortName ?? '';
  const current = { routeShortName: name, routeLongName: directions[0].routeLongName, directions };
  return buildRouteCardModel({
    directions, routeShortName: name, routeLongName: directions[0].routeLongName ?? '', directionGroups: buildDirectionGroups(current, period),
    agencyFeatures: undefined, period, maxHeadway: 60, nightView: false, stableColors: false, hideSpan: false,
  });
}

describe('published routes (#1909)', () => {
  it('Intercity Transit 9X westbound reads every 15 in the PM peak, as the map does', () => {
    const lines = publishedCard(it9x as unknown as ShapeProperties[], 'pmPeak').reportServiceLines;
    expect(lines).toContain('- to Capital Mall-The Evergreen State College: every 15 min');
    expect(lines.filter(line => line.includes('Capital Mall'))).toHaveLength(1);
  });
  it('RTD 15 eastbound: Tower Rd, a branch past Billings, keeps its own every 30 beside the span pattern', () => {
    const lines = publishedCard(rtd15 as unknown as ShapeProperties[], 'midday').reportServiceLines;
    expect(lines).toContain('- to Tower Rd: every 30 min');
  });
  it('Broome 35 Saturday midday eastbound: the merged row reads every 60, as its two patterns run together', () => {
    const lines = publishedCard(broome35 as unknown as ShapeProperties[], 'midday').reportServiceLines;
    expect(lines).toContain('- to BC Junction via Main: every 60 min');
  });
  // Guard: a merged (pooled) row never grades faster than its direction's filter value, so the card cannot overstate the map.
  it('no merged row reads faster than its direction\'s filter value (GO 40 southbound PM: its own 15, the route 17 from northbound)', () => {
    const grade = (v: number) => PUBLIC_TIER_MAXES.findIndex(m => v <= m);
    for (const [features, period] of [[go40, 'amPeak'], [go40, 'pmPeak'], [it9x, 'pmPeak'], [broome35, 'midday']] as const) {
      const directions = features as unknown as ShapeProperties[];
      for (const g of buildDirectionGroups({ directions }, period)) {
        if (!g.pooledMain) continue;
        const filter = g.pooledMain.feature.directionFilterHeadwayByPeriod?.[period];
        if (typeof filter === 'number') expect(grade(g.pooledMain.headway)).toBeGreaterThanOrEqual(grade(filter));
      }
    }
    expect(publishedCard(go40 as unknown as ShapeProperties[], 'pmPeak').reportServiceLines).toContain('- to Hamilton GO: every 15 min');
  });
});
