import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel } from '../routeCardRows';
import { routeCardDirectionOrder } from '../routeCardRoute';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { PeriodKey } from '../../../shared/config';
import winnipeg31json from './fixtures/winnipeg-31-weekday.json';

// Winnipeg Transit 31, weekday (release-mwvbser2; per-stop fields left out). Toward The Forks the only feature is a tail
// whose trips stop partway through the PM peak, so #1115 hid it and the card showed only "to Riverbend" (#1857).
const features = (winnipeg31json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

function rows(period: PeriodKey) {
  const directions = routeCardDirectionOrder(features, period);
  const route = { routeShortName: '31', routeLongName: null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period),
    agencyFeatures: undefined, period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  return model.groups.flatMap(g => g.rows.map(r => ({ label: r.label, every: r.display(null).value.headway })));
}

describe('a direction whose only lines are hidden tails keeps one row (#1857)', () => {
  it('Winnipeg 31 PM peak shows both directions', () => {
    expect(rows('pmPeak')).toEqual([
      { label: 'to Riverbend', every: 14 },
      { label: 'to The Forks', every: 28 },
    ]);
  });
});
