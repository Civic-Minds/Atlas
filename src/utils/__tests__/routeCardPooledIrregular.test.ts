import { describe, expect, it } from 'vitest';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import ttc169json from './fixtures/ttc-169-weekday.json';
import sherbrooke4json from './fixtures/sherbrooke-4-weekday.json';

// #1534 (CIV-1658): a destination pool now speaks for a row whose drawn shape has a midday hole, and its period values
// can then be a few departures' typical gap: TTC 169 to Don Mills midday 180 (two buses, 09:01 and 14:31, on the drawn
// stops), Sherbrooke 4 to Galvin midday 168 (9:06, 14:11, 14:41) and AM 50 (6:55, 7:11, 8:35). The card reads these
// as Irregular, as it reads TTC 10's midday 173: never as a number. Weekday route files of the #1534 build, geometry
// left out.
const props = (json: unknown) => (json as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

function rows(directions: ShapeProperties[], route: string, period: TimePeriod): string[] {
  const m = buildRouteCardModel({
    directions, routeShortName: route, routeLongName: '', directionGroups: buildDirectionGroups({ directions }, period),
    agencyFeatures: undefined, period, maxHeadway: 60, nightView: false, stableColors: false, hideSpan: false,
  });
  return m.groups.flatMap(g => g.rows).map(r => `${r.label}: ${reportRowValueText(r)}`);
}

describe('pooled rows with a few departures in a period read Irregular (#1534)', () => {
  it('TTC 169 weekday midday: to Don Mills is Irregular, the Van Horne rows keep every 30', () => {
    const r = rows(props(ttc169json), '169', 'midday');
    expect(r).toContain('to Don Mills: Runs irregularly in this period');
    expect(r).toContain('to Don Mills via Van Horne: every 30 min');
  });

  it('Sherbrooke 4 weekday: to Galvin is Irregular at midday and AM peak, Station du Cégep keeps every 30 at midday', () => {
    const midday = rows(props(sherbrooke4json), '4', 'midday');
    expect(midday).toContain('to Galvin / des Trembles: Runs irregularly in this period');
    expect(midday).toContain('to Station du Cégep - Quai A: every 30 min');
    expect(rows(props(sherbrooke4json), '4', 'amPeak')).toContain('to Galvin / des Trembles: Runs irregularly in this period');
    expect(rows(props(sherbrooke4json), '4', 'evening')).toContain('to Galvin / des Trembles: every 28 min');
  });
});
