import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel } from '../routeCardRows';
import { routeCardRowValue } from '../routeCardRowValue';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import ttc102json from './fixtures/ttc-102-weekday.json';

// TTC 102 Markham Rd, weekday (properties only; per-stop fields left out).
const directions = (ttc102json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

function card(period: 'pmPeak' | 'midday') {
  const current = { routeShortName: '102', routeLongName: 'Markham Rd', directions };
  return buildRouteCardModel({
    directions, routeShortName: '102', routeLongName: 'Markham Rd', directionGroups: buildDirectionGroups(current, period),
    agencyFeatures: undefined, period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
}

describe('one shared value per card group (#1232)', () => {
  it('a destination under a Shared stretch row reads its own value, not a second shared range (TTC 102 PM)', () => {
    const group = card('pmPeak').groups.find(g => g.shared != null)!;
    expect(group.shared).toMatchObject({ label: 'Shared stretch', headway: 7 });
    const warden = group.rows.find(r => r.label === 'to Warden')!.display(null).value;
    expect(warden.headway).toBe(30);
    expect(warden.trunkHeadway).toBeUndefined();
  });
  it('a row with no Shared stretch row above it keeps its range', () => {
    // OC Transpo 84 style: the row's own 60 with the headsign's busiest stops every 20 ("every 20–60 min").
    const d = {
      routeId: '84', routeShortName: '84', routeLongName: '', directionId: 0, headsign: 'Centrepointe', tier: '60', headway: 60,
      headwayByPeriod: { pmPeak: 60 }, headsignMinStopHeadwayByPeriod: { pmPeak: 20 }, stretchRole: 'main', stretchIndex: 0,
    } as unknown as ShapeProperties;
    const ctx = { period: 'pmPeak' as const, hoveredHour: null, stretchMode: true, noRegularService: false, maxHeadway: Infinity };
    // CIV-1251: a branch row shows only its own number; no card row reads the shared-stretch range.
    expect(routeCardRowValue(d, ctx).trunkHeadway).toBeUndefined();
    expect(routeCardRowValue(d, { ...ctx, sharedRowShown: true }).trunkHeadway).toBeUndefined();
  });
});

describe('the Shared stretch row is left out when a main row shows its exact number (CIV-995 Q2)', () => {
  // TTC 102 PM: the main rows read their stretch (CIV-995) once the data carries its rows and trip check.
  const withStretch = (cadence: number) => directions.map(d => d.stretchRole === 'main' && d.stretchMeta?.main
    ? { ...d, stretchRowPeriods: ['pmPeak'], stretchMeta: { ...d.stretchMeta, main: { ...d.stretchMeta.main, noRegular: [], rows: { cadence: { pmPeak: cadence }, longestGap: { pmPeak: cadence }, steady: ['pmPeak'], hourly: {} } } } }
    : d) as ShapeProperties[];
  const model = (dirs: ShapeProperties[], stretchValues?: boolean) => buildRouteCardModel({
    directions: dirs, routeShortName: '102', routeLongName: 'Markham Rd', directionGroups: buildDirectionGroups({ directions: dirs }, 'pmPeak'),
    agencyFeatures: undefined, period: 'pmPeak', maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false, stretchValues,
  });
  it('same number: no Shared stretch row', () => {
    const group = model(withStretch(7)).groups.find(g => g.rows.some(r => r.feature.stretchRole === 'main' && r.display(null).value.headway === 7))!;
    expect(group.shared).toBeNull();
  });
  it('different numbers: the Shared stretch row stays', () => {
    expect(model(withStretch(8)).groups.some(g => g.shared?.headway === 7)).toBe(true);
  });
  it('the stop card\'s and lists\' own-trips model keeps it', () => {
    expect(model(withStretch(7), false).groups.some(g => g.shared?.headway === 7)).toBe(true);
  });
});
