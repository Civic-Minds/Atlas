import { describe, expect, it } from 'vitest';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import mt10json from './fixtures/metro-transit-10-saturday.json';

// Metro Transit 10 Saturday (Oct 30 local copy of the published route file, geometry left out).
const mt10 = (mt10json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

function card(period: TimePeriod, maxHeadway = 60) {
  const current = { routeShortName: '10', routeLongName: '', directions: mt10 };
  return buildRouteCardModel({
    directions: mt10, routeShortName: '10', routeLongName: '', directionGroups: buildDirectionGroups(current, period),
    agencyFeatures: undefined, period, maxHeadway, nightView: false, stableColors: false, hideSpan: false,
  });
}

describe('CIV-1199: the part-period notice reads the numbers the rows show (one calculation per fact)', () => {
  it("the notice's number is the one the row shows (Metro Transit 10 Saturday late: every 31, not the row's internal 26)", () => {
    const m = card('late');
    const rows = m.groups.flatMap(g => g.rows);
    expect(rows.map(r => `${r.label}: ${reportRowValueText(r)}`)).toEqual(['to Central / 53Ave-Target: every 31 min, with one 56 min gap']);
    expect(m.rowHeadways).toEqual([31]);
  });
});
