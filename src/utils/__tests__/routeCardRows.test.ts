import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { buildRouteCardModel, matchesHoveredBranch, reportRowValueText, rowIsHovered, sharedIsHovered } from '../routeCardRows';

const row = (directionId: number, headsign: string, midday: number, routeVariant?: string) => ({
  routeId: '52', routeShortName: '52', directionId, headsign, tier: '15', headway: midday,
  headwayByPeriod: { midday }, ...(routeVariant ? { routeVariant } : {}),
}) as unknown as ShapeProperties;

const model = (directions: ShapeProperties[]) => buildRouteCardModel({
  directions,
  routeShortName: '52',
  routeLongName: 'Lawrence West',
  directionGroups: [0, 1].map(dirId => ({ dirId, realTier: directions.filter(d => d.directionId === dirId), span: [] })),
  period: 'midday',
  maxHeadway: Infinity,
  nightView: false,
  stableColors: false,
  hideSpan: false,
});

describe('route card rows, built once (CIV-987)', () => {
  const directions = [row(0, 'Pearson Airport', 17), row(0, 'Westwood', 24, 'from Westwood'), row(1, 'Lawrence West Station', 20)];

  it('gives every row a stable id and the hover it sends', () => {
    const m = model(directions);
    expect(m.groups.flatMap(g => g.rows.map(r => r.id))).toEqual([
      '0:0:pearson airport:', '0:1:westwood:from westwood', '1:0:lawrence west station:',
    ]);
    expect(m.groups[0].rows[1].hover).toEqual({ directionId: 0, headsign: 'Westwood', routeVariant: 'from Westwood' });
    expect(model(directions).groups.flatMap(g => g.rows.map(r => r.id))).toEqual(m.groups.flatMap(g => g.rows.map(r => r.id)));
  });

  it('reads each row value once for the hour under the pointer or none', () => {
    const shown = model(directions).groups[0].rows[0].display(null);
    expect(shown.value.headway).toBe(17);
    expect(shown.singleLine).toBe(true);
  });

  it('matches hover by direction, destination and pattern (#1064), and keeps the shared row to itself', () => {
    const m = model(directions);
    const westwood = m.groups[0].rows[1];
    expect(rowIsHovered(westwood.hover, westwood)).toBe(true);
    expect(rowIsHovered({ directionId: 1, headsign: 'Westwood' }, westwood)).toBe(false);
    expect(matchesHoveredBranch({ headsign: 'Westwood', routeVariant: 'via Dixon' }, 'Westwood', 'from Westwood')).toBe(false);
    expect(rowIsHovered({ directionId: 0, headsigns: ['Westwood'], isCore: true }, westwood)).toBe(false);
    expect(sharedIsHovered({ directionId: 0, isCore: true }, 0)).toBe(true);
  });

  it('writes the issue report from the rows the card shows (#1230)', () => {
    const m = model(directions);
    // The card's Combined row is in the report too, with the value the card shows.
    expect(m.groups[0].shared).toMatchObject({ label: 'Shared stretch', headway: 10 });
    expect(m.reportServiceLines).toEqual([
      '- Shared stretch every 10 min; each branch every 17–24 min',
      '- to Pearson Airport: every 17 min',
      '- from Westwood to Westwood: every 24 min',
      '- to Lawrence West Station: every 20 min',
    ]);
  });

  it('reports a row the card reads as limited with the card\'s word', () => {
    // It runs in the period (the direction's coverage) but has no cadence of its own.
    const limited = { ...row(0, 'Pearson Airport', 17), headway: null, headwayByPeriod: {}, worstDirectionPeriodCoverageHeadway: { midday: 90 } } as unknown as ShapeProperties;
    const [first] = model([limited, row(1, 'Lawrence West Station', 20)]).groups[0].rows;
    expect(first.display(null).value.isLimited).toBe(true);
    // CIV-1251: in a time period a row with no number reads Irregular, whichever check found it.
    expect(reportRowValueText(first)).toBe('Runs irregularly in this period');
  });
});

describe('#1277: a period the route runs only part of shows the rows that say when', () => {
  // AC Transit 14 weekday late: no filter value, the route does not run through the period; each direction runs until 12:22 AM.
  const late = (directionId: number, headsign: string, edge?: { until: number; every: number }) => ({
    routeId: '14', routeShortName: '14', directionId, headsign, tier: '30', headway: 30, stretchRole: 'main', stretchIndex: 0,
    headwayByPeriod: { late: 30 }, periodCoverageHeadway: { late: 120 },
    routeFilterHeadwayByPeriod: { late: null }, routeRunsByPeriod: { late: false }, directionFilterHeadwayByPeriod: { late: null },
    ...(edge ? { stretchPeriodEdge: { late: edge } } : {}),
  }) as unknown as ShapeProperties;
  const build = (directions: ShapeProperties[]) => buildRouteCardModel({
    directions, routeShortName: '14', routeLongName: '', period: 'late', maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
    directionGroups: [0, 1].map(dirId => ({ dirId, realTier: directions.filter(d => d.directionId === dirId), span: [] })),
  });

  it('shows the rows with an until or from time, and no others', () => {
    const m = build([late(0, 'West Oakland BART', { until: 1462, every: 30 }), late(1, 'Fruitvale BART')]);
    expect(m.doesNotRun).toBe(false);
    expect(m.groups.flatMap(g => g.rows.map(r => r.display(null).value.headwayLabel))).toEqual(['every 30 min until 12:22 AM']);
  });

  it('with no row saying when, the route still does not run', () => {
    const m = build([late(0, 'West Oakland BART'), late(1, 'Fruitvale BART')]);
    expect([m.doesNotRun, m.groups.length]).toEqual([true, 0]);
  });
});

describe('CIV-1251 row 8: branches that take turns on a shared stretch that starts late', () => {
  // TTC 110 Sunday AM southbound: no filter value; the shared stretch every 15 from 8:07, Kipling's own trips every 30 from 7:29.
  const meta = { main: { stops: 10, refStop: 'm', trips: 60, edge: { amPeak: { from: 487, every: 15 } } }, tails: [{ refStop: 'a', stops: 5, km: 2, trips: 30 }, { refStop: 'b', stops: 5, km: 2, trips: 30, edge: { amPeak: { from: 449, every: 30 } } }] };
  const tail = (headsign: string, stretchIndex: number) => ({
    routeId: '110', routeShortName: '110', directionId: 0, headsign, tier: '30', headway: 30, stretchRole: 'tail', stretchIndex,
    stretchCovers: ['main', stretchIndex], stretchMeta: meta, headwayByPeriod: { amPeak: 30 }, departuresByHour: { 7: 1, 8: 2 },
    routeFilterHeadwayByPeriod: { amPeak: null }, routeRunsByPeriod: { amPeak: false }, directionFilterHeadwayByPeriod: { amPeak: null },
    stretchPeriodEdge: { amPeak: { from: 487, every: 15, stretch: 'main' } },
  }) as unknown as ShapeProperties;
  const directions = [tail('Long Branch', 0), tail('Kipling and Lake Shore', 1)];
  const m = buildRouteCardModel({
    directions, routeShortName: '110', routeLongName: '', period: 'amPeak', maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
    directionGroups: [{ dirId: 0, realTier: directions, span: [], directionFeatures: directions }],
  });

  it('the Shared stretch row says when the shared stretch runs; each branch row only its own trips', () => {
    expect(m.groups[0].shared).toMatchObject({ label: 'Shared stretch', headway: 15, edgeText: 'every 15 min from 8:07 AM' });
    expect(m.groups[0].rows.map(r => [r.label, r.display(null).value.headwayLabel])).toEqual([['to Kipling and Lake Shore', 'every 30 min from 7:29 AM']]);
  });
});

describe('CIV-1251 review: one word for a row with no number', () => {
  const build = (nightView: boolean, period: 'midday' | 'all', extra: Record<string, unknown> = {}) => {
    const d = { ...row(0, 'Pearson Airport', 17), ...extra } as unknown as ShapeProperties;
    return buildRouteCardModel({
      directions: [d], routeShortName: '52', routeLongName: '', period, maxHeadway: Infinity, nightView, stableColors: false, hideSpan: false,
      directionGroups: [{ dirId: 0, realTier: [d], span: [] }],
    });
  };
  it('the Night card reads "Runs irregularly overnight" for every row with no number, from one function', () => {
    const m = build(true, 'midday');
    expect([m.noRegularLabel, m.limitedWord]).toEqual(['Runs irregularly overnight', 'Runs irregularly overnight']);
  });
  it('All day: a part-time route reads Part-time for both checks', () => {
    const m = build(false, 'all', { routeAllDayHeadway: 999999, routeHasLimitedDirection: true });
    expect([m.noRegularLabel, m.limitedWord]).toEqual(['Part-time', 'Part-time']);
  });
});
