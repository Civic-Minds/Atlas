import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { routeCardDirectionOrder } from '../routeCardRoute';
import { routeCardRowValue } from '../routeCardRowValue';
import { mainStretchStops } from '../rowShortEnd';
import { buildSectionColourFeatures } from '../sectionColours';

// #1502, #1505 (CIV-1595): weekday route features cut from the published release-mwgrzbgq route files with their sections
// files applied (as beta loads them); stop features kept for the section colours.
const load = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8')) as GeoJSON.FeatureCollection;
const routeFeatures = (fc: GeoJSON.FeatureCollection) => fc.features.map(f => f.properties as ShapeProperties).filter(p => (p as { stopId?: string }).stopId == null);

function cardRows(features: ShapeProperties[], period: 'midday' | 'amPeak', sectionColours: boolean): Record<string, string> {
  const directions = routeCardDirectionOrder(features, period);
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false, sectionColours,
  });
  return Object.fromEntries(model.groups.flatMap(g => g.rows).map(row => [row.feature.headsign ?? '', reportRowValueText(row)]));
}

describe('a row with a short end slower than its number reads the range to it (#1502, #1505)', () => {
  const green = routeFeatures(load('cta-green-weekday.json'));
  const lw = load('go-lw-weekday.json');
  const lwRoutes = routeFeatures(lw);

  it('CTA Green midday: each southern branch reads every 10–20 with section colours, every 10 on public', () => {
    const beta = cardRows(green, 'midday', true);
    expect(beta['East 63rd-Cottage Grove']).toBe('every 10–20 min');
    expect(beta['Ashland/63rd']).toBe('every 10–20 min');
    const pub = cardRows(green, 'midday', false);
    expect(pub['East 63rd-Cottage Grove']).toBe('every 10 min');
    expect(pub['Ashland/63rd']).toBe('every 10 min');
  });

  it('CTA Green: the row\'s dot takes the slow end\'s colour with section colours only', () => {
    const southbound = green.filter(f => f.directionId === 0);
    const cottage = southbound.find(f => f.headsign === 'East 63rd-Cottage Grove')!;
    const ctx = { period: 'midday' as const, hoveredHour: null, stretchMode: true, noRegularService: false, maxHeadway: Infinity };
    const beta = routeCardRowValue(cottage, { ...ctx, sectionColours: true, mainStretchStops: mainStretchStops(southbound) });
    expect([beta.trunkHeadway, beta.headway, beta.colorHeadway]).toEqual([10, 20, 20]);
    const pub = routeCardRowValue(cottage, ctx);
    expect([pub.trunkHeadway, pub.headway, pub.colorHeadway]).toEqual([undefined, 10, 10]);
  });

  it('GO Lakeshore West midday: to Confederation GO reads its end\'s own value, as the map grades that end', () => {
    // 30 against 264 is over 4 times apart, so the range rule (headwayRangeShown) shows the slow number alone.
    expect(cardRows(lwRoutes, 'midday', true)['Confederation GO']).toBe('every 264 min');
    expect(cardRows(lwRoutes, 'midday', false)['Confederation GO']).toBe('every 30 min');
    const piece = buildSectionColourFeatures({ go: lw }, 'Weekday', 'default', undefined, 'midday')
      .filter(f => f.properties.headsign === 'Confederation GO' && f.properties.directionId === 0);
    // The line's last piece, West Harbour to Confederation.
    expect(piece.map(f => [f.properties.tier, f.properties.headway]).at(-1)).toEqual(['infrequent', 264]);
  });

  it('GO Lakeshore West: the West Harbour row reads the range to its end', () => {
    const westbound = lwRoutes.filter(f => f.directionId === 0);
    const wh = westbound.find(f => f.headsign === 'West Harbour GO')!;
    const value = routeCardRowValue(wh, { period: 'midday', hoveredHour: null, stretchMode: true, noRegularService: false, maxHeadway: Infinity, sectionColours: true, mainStretchStops: mainStretchStops(westbound) });
    expect([value.trunkHeadway, value.headway]).toEqual([30, 61]);
  });

  it('a row with no slower short end is unchanged (GO LW to Aldershot GO, and Union Station GO, the direction\'s one main row)', () => {
    const ctx = { period: 'midday' as const, hoveredHour: null, stretchMode: true, noRegularService: false, maxHeadway: Infinity };
    for (const dir of [0, 1]) {
      const features = lwRoutes.filter(f => f.directionId === dir);
      const row = features.find(f => f.headsign === (dir === 0 ? 'Aldershot GO' : 'Union Station GO'))!;
      const before = routeCardRowValue(row, { ...ctx, sectionColours: true });
      const beta = routeCardRowValue(row, { ...ctx, sectionColours: true, mainStretchStops: mainStretchStops(features) });
      expect(beta).toEqual(before);
      expect(beta.trunkHeadway).toBeUndefined();
    }
  });
});
