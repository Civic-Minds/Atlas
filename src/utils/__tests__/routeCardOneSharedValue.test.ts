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
    expect(routeCardRowValue(d, ctx).trunkHeadway).toBe(20);
    expect(routeCardRowValue(d, { ...ctx, sharedRowShown: true }).trunkHeadway).toBeUndefined();
  });
});
