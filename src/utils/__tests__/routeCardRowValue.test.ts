import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routeCardRowValue } from '../routeCardRowValue';
import { buildSectionColourFeatures, tierOfHeadway } from '../sectionColours';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const ctx = { period: 'midday' as const, hoveredHour: null, stretchMode: false, noRegularService: false, maxHeadway: Infinity };

describe('routeCardRowValue (CIV-992)', () => {
  it('shows a steady row its own cadence, coloured by the filter value', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10, headwayByPeriod: { midday: 10 } } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, ctx);
    expect(row.headway).toBe(10);
    expect(row.isLimited).toBe(false);
    expect(row.dimmed).toBe(false);
  });
  it('reads as the route does when the route has no regular cadence on All day', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10 } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, { ...ctx, period: 'all', noRegularService: true });
    expect(row.rowNoRegular).toBe(true);
    expect(row.headway).toBeUndefined();
    expect(row.isLimited).toBe(true);
  });

  // #1142 (CIV-1018): TTC 320 southbound, weekday overnight: every 5 from 2:00 to 3:20, then every 15 or more.
  const uneven = (role: 'main' | 'tail', typical: number | null) => ({
    routeId: '320', routeShortName: '320', routeLongName: 'Yonge', directionId: 0, headsign: 'Queens Quay', tier: '10',
    headway: 7, headwayByPeriod: { overnight: 7 }, stretchRole: role, stretchIndex: 0,
    stretchPeriodHeadway: { overnight: 18 }, stretchPeriodTypical: { overnight: typical },
  }) as unknown as ShapeProperties;
  const overnight = { ...ctx, period: 'overnight' as const, stretchMode: true };

  it("reads an uneven period's main row as typical to worst, its number the worst wait", () => {
    const row = routeCardRowValue(uneven('main', 5), overnight);
    expect(row.headway).toBe(18);
    expect(row.headwayLabel).toBe('every 5–18 min');
  });
  it('leaves a steady period, a tail and the hovered hour as they were', () => {
    expect(routeCardRowValue(uneven('main', null), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('tail', 5), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('main', 5), { ...overnight, hoveredHour: 2 }).headwayLabel).toBeUndefined();
  });

  // #1267: Overnight reads the Night Service verdict. TTC 301 weekday: Night Service 30, while the row's own 2-6 AM trips
  // read every 71 across the lull before day service and an uneven 5-71.
  const ttc301 = (direction: number | null, lit = true) => ({
    ...uneven('main', 5), routeId: '301', routeShortName: '301', headsign: 'Long Branch', headwayByPeriod: { overnight: 71 },
    stretchPeriodHeadway: { overnight: 71 }, directionFilterHeadwayByPeriod: { overnight: direction }, nightService60: lit,
  }) as unknown as ShapeProperties;
  const contract = (filterValue: number | null) => ({ filterValue, runs: true, range: null });
  it('shows the route night value on an Overnight row, never its own 2-6 AM number, a range or part-period words', () => {
    const row = routeCardRowValue(ttc301(28), { ...overnight, contract: contract(30) });
    expect(row.headway).toBe(30);
    expect(row.headwayLabel).toBeUndefined();
    expect(row.edgeText).toBeUndefined();
    expect(row.rowNoRegular).toBe(false);
  });
  it('gives a row the Night view does not light no Overnight value (NYC subway S: the 42 St shuttle stops at night)', () => {
    const row = routeCardRowValue(ttc301(20, false), { ...overnight, contract: contract(20) });
    expect(row.headway).toBeUndefined();
    expect(row.rowNoRegular).toBe(true);
  });
  it('gives a direction that passes only on its night path no Overnight value, while the route keeps one (NYC subway 3)', () => {
    const row = routeCardRowValue(ttc301(null), { ...overnight, contract: contract(20) });
    expect(row.headway).toBeUndefined();
    expect(row.rowNoRegular).toBe(true);
  });

  // CIV-1143 (option B): OC Transpo 84 to Centrepointe, weekday PM: the last trip is at 5:05 PM. The row keeps its own words;
  // the shared-stretch range ("every 60–120 min") never replaces them.
  const oc84 = (edge: boolean) => ({
    routeId: '84', routeShortName: '84', routeLongName: '', directionId: 0, headsign: 'Centrepointe', tier: '60', headway: 60,
    headwayByPeriod: { pmPeak: 60 }, headsignMinStopHeadwayByPeriod: { pmPeak: 20 }, stretchRole: 'main', stretchIndex: 0,
    ...(edge ? { stretchPeriodEdge: { pmPeak: { until: 1025, every: 60 } } } : {}),
  }) as unknown as ShapeProperties;
  const pm = { ...ctx, period: 'pmPeak' as const, stretchMode: true };

  it('gives no shared-stretch range to a row with its own until / from / gap words (CIV-1143)', () => {
    const row = routeCardRowValue(oc84(true), pm);
    expect(row.edgeText).toBe('every 60 min until 5:05 PM');
    expect(row.trunkHeadway).toBeUndefined();
  });
  it('CIV-1251: no row reads the shared-stretch range, with or without such words', () => {
    expect(routeCardRowValue(oc84(false), pm).trunkHeadway).toBeUndefined();
  });
});

// #962 (Ryan picked option 1): a main row with no value of its own falls back to its direction's filter value. exo MA weekday
// midday (09:05, then 14:06, then 18:18) is not steady, so that value is the worst wait, 301: the row reads no regular service.
// Steady slow service keeps its number.
describe('the direction fallback of an unsteady stretch (#962)', () => {
  const row = (filter: number, steady: boolean) => ({
    routeId: 'MA', routeShortName: 'MA', routeLongName: 'Mascouche', directionId: 0, headsign: 'Côte-de-Liesse', tier: 'limited',
    headwayByPeriod: { midday: null }, stretchRole: 'main', stretchIndex: 0,
    directionFilterHeadwayByPeriod: { midday: filter }, stretchPeriodHeadway: { midday: filter }, stretchPeriodSustained: { midday: steady },
  }) as unknown as ShapeProperties;
  const midday = { ...ctx, stretchMode: true };
  it('reads no regular service where the stretch is not steady (exo MA midday: never "every 301")', () => {
    const value = routeCardRowValue(row(301, false), midday);
    expect(value.headway).toBeUndefined();
    expect(value.rowNoRegular).toBe(true);
  });
  it('keeps a wait of an hour or less, uneven but frequent service (Lexington 5 to Wal Mart midday, "every 37")', () => {
    const value = routeCardRowValue(row(37, false), midday);
    expect(value.headway).toBe(37);
    expect(value.rowNoRegular).toBe(false);
    expect(routeCardRowValue(row(60, false), midday).headway).toBe(60);
    expect(routeCardRowValue(row(61, false), midday).rowNoRegular).toBe(true);
  });
  it('keeps a steady stretch its number (slow service every 120)', () => {
    const value = routeCardRowValue(row(120, true), midday);
    expect(value.headway).toBe(120);
    expect(value.rowNoRegular).toBe(false);
  });
});

// #1506: GO KI weekday midday, cut from the published release-mwgrzbgq route and sections files.
describe('row dot with section colours (#1506)', () => {
  const ki = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'go-ki-weekday.json'), 'utf8')) as GeoJSON.FeatureCollection;
  const kitchener = ki.features.find(f => f.properties?.stopId == null && f.properties?.headsign === 'Kitchener GO')!.properties as ShapeProperties;
  const midday = { ...ctx, stretchMode: true };

  it('public keeps the filter colour; with section colours the dot is never better than the row\'s number', () => {
    const pub = routeCardRowValue(kitchener, midday);
    expect(pub.shownHeadway).toBe(120);
    expect(pub.colorHeadway).toBe(30);
    expect(routeCardRowValue(kitchener, { ...midday, sectionColours: true }).colorHeadway).toBe(120);
  });

  it('the map draws that stretch in the same (infrequent) colour as the dot', () => {
    const pieces = buildSectionColourFeatures({ go: ki }, 'Weekday', 'default', undefined, 'midday')
      .filter(f => f.properties.headsign === 'Kitchener GO');
    expect(pieces.map(f => f.properties.tier)).toEqual([tierOfHeadway(120)]);
  });

  it('a row reading its filter value or better keeps the filter colour', () => {
    const union = ki.features.find(f => f.properties?.stopId == null && f.properties?.headsign === 'Union Station GO')!.properties as ShapeProperties;
    expect(routeCardRowValue(union, { ...midday, sectionColours: true }).colorHeadway).toBe(30);
  });
});

// CIV-1156: SEPTA 67 weekday (release-mwi8lkbg). Toward Frankford, the main stretch runs every 25 in the evening (longest gap
// 30, Verree Rd & Hartel Av); the Philadelphia Mills branch has three evening trips (19:17, 20:09, 22:58), so the direction's
// value is 169 and the main row read "every 111–169 min".
describe('a main row never shows more than its main stretch\'s longest gap (CIV-1156)', () => {
  const fc = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'septa-67-weekday.json'), 'utf8')) as GeoJSON.FeatureCollection;
  const props = fc.features.map(f => f.properties as unknown as ShapeProperties);
  const toFrankford = props.find(p => p.directionId === 1 && p.stretchRole === 'main' && p.tier === 'infrequent')!;
  const evening = { ...ctx, period: 'evening' as const, stretchMode: true };
  const uneven = (role: 'main', typical: number) => ({
    routeId: '320', routeShortName: '320', routeLongName: 'Yonge', directionId: 0, headsign: 'Queens Quay', tier: '10',
    headway: 7, headwayByPeriod: { overnight: 7 }, stretchRole: role, stretchIndex: 0,
    stretchPeriodHeadway: { overnight: 18 }, stretchPeriodTypical: { overnight: typical },
  }) as unknown as ShapeProperties;

  it("reads SEPTA 67 to Frankford's evening as the main stretch's every 25, with no range", () => {
    const row = routeCardRowValue(toFrankford, evening);
    expect(row.headway).toBe(25);
    expect(row.shownHeadway).toBe(25);
    expect(row.headwayLabel).toBeUndefined();
    expect(row.rowNoRegular).toBe(false);
    // The filter still decides on the branch's wait: the dot keeps its colour.
    expect(row.colorHeadway).toBe(169);
  });
  it('leaves the lists (own trips), the hovered hour and a tail row as they were', () => {
    const lists = routeCardRowValue(toFrankford, { ...evening, stretchValues: false });
    expect([lists.headway, lists.headwayLabel]).toEqual([169, 'every 111–169 min']);
    expect(routeCardRowValue(toFrankford, { ...evening, hoveredHour: 20 }).headway).toBe(25);
    expect(routeCardRowValue({ ...toFrankford, stretchRole: 'tail' } as ShapeProperties, evening).headway).toBeUndefined();
  });
  it("keeps a main row's own trips above the main stretch's longest gap (SEPTA 45 to 12th-Vine, weekday midday: 30, gap 15)", () => {
    const fc45 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'septa-45-weekday.json'), 'utf8')) as GeoJSON.FeatureCollection;
    const toVine = fc45.features.map(f => f.properties as unknown as ShapeProperties).find(p => p.headsign === '12th-Vine')!;
    expect(toVine.stretchMeta?.main?.maxGap?.midday).toBe(15);
    expect(routeCardRowValue(toVine, { ...ctx, stretchMode: true }).headway).toBe(30);
  });
  it('keeps an uneven main row whose worst wait is within the main stretch\'s longest gap (MBTA Worcester PM: 28, gap 35)', () => {
    const worcester = {
      ...uneven('main', 10), headwayByPeriod: { pmPeak: 30 }, stretchPeriodHeadway: { pmPeak: 28 }, stretchPeriodTypical: { pmPeak: 10 },
      stretchMeta: { main: { refStop: 'x', period: { pmPeak: 28 }, maxGap: { pmPeak: 35 } }, tails: [] },
    } as unknown as ShapeProperties;
    const row = routeCardRowValue(worcester, { ...ctx, period: 'pmPeak', stretchMode: true });
    expect(row.shownHeadway).toBe(28);
    expect(row.headwayLabel).toBe('every 10–28 min');
  });
  it('keeps an uneven main row on data without the main stretch\'s longest gap', () => {
    const row = routeCardRowValue(uneven('main', 5), { ...ctx, period: 'overnight', stretchMode: true });
    expect(row.headway).toBe(18);
  });
});
