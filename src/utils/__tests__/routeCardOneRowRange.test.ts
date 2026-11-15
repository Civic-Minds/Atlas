import { describe, expect, it } from 'vitest';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import { buildRouteCardModel, reportRowValueText } from '../routeCardRows';
import { oneRowMainStretchHeadway } from '../routeCardTrunk';
import njt27json from './fixtures/njt-27-sunday.json';

// NJ Transit 27 Sunday, with the identical-shape join on (CIV-1447 dry run; per-stop fields left out).
const njt27 = (njt27json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

function card(directions: ShapeProperties[], period: TimePeriod, nightView = false) {
  const current = { routeShortName: '27', routeLongName: '', directions };
  return buildRouteCardModel({
    directions, routeShortName: '27', routeLongName: '', directionGroups: buildDirectionGroups(current, period),
    agencyFeatures: undefined, period, maxHeadway: Infinity, nightView, stableColors: false, hideSpan: false,
  });
}

const rowsText = (directions: ShapeProperties[], period: TimePeriod, dirId: number) =>
  card(directions, period).groups.filter(g => g.dirId === dirId).flatMap(g => g.rows.map(r => `${r.label}: ${reportRowValueText(r)}`));

describe('CIV-1447: a direction with one branch row reads the range from the main stretch to the branch', () => {
  it('NJ Transit 27 Sunday toward Irvington: every 15–54 on Midday, every 15–45 on PM Peak', () => {
    expect(rowsText(njt27, 'midday', 1)).toEqual(['to Irvington via Pru Ctr: every 15–54 min']);
    expect(rowsText(njt27, 'pmPeak', 1)).toEqual(['to Irvington via Pru Ctr: every 15–45 min']);
    const value = card(njt27, 'midday').groups.find(g => g.dirId === 1)!.rows[0].display(null).value;
    // The row's own number stays the branch's; the filter's colour is unchanged.
    expect(value).toMatchObject({ headway: 54, trunkHeadway: 15 });
  });

  it('a direction with two or more rows keeps its Shared stretch row and each row its own number', () => {
    const group = card(njt27, 'midday').groups.find(g => g.dirId === 0)!;
    expect(group.shared).toMatchObject({ label: 'Shared stretch', headway: 15 });
    expect(group.rows.map(r => r.display(null).value.trunkHeadway)).toEqual(group.rows.map(() => undefined));
  });

  it('a one-row branch no slower than the main stretch stays one number (NJ Transit 27 Sunday Late toward Irvington: 30 on 30)', () => {
    expect(rowsText(njt27, 'late', 1)).toEqual(['to Irvington via Pru Ctr: every 30 min']);
  });

  it('a one-row direction with no branch stays one number', () => {
    const main = {
      routeId: '9', routeShortName: '9', routeLongName: '', directionId: 0, headsign: 'Downtown', tier: '15', headway: 30,
      headwayByPeriod: { midday: 30 }, stretchRole: 'main', stretchIndex: 0,
      stretchMeta: { main: { stops: 20, refStop: 'm', trips: 40, period: { midday: 15 } }, tails: [] },
    } as unknown as ShapeProperties;
    expect(oneRowMainStretchHeadway({ realTier: [main], span: [] }, 'midday')).toBeNull();
    expect(rowsText([main], 'midday', 0)).toEqual(['to Downtown: every 30 min']);
  });

  it('no range on the Night card, and none for Overnight', () => {
    expect(card(njt27, 'midday', true).groups.flatMap(g => g.rows.map(r => r.display(null).value.trunkHeadway)).every(v => v == null)).toBe(true);
    const irvington = njt27.find(d => d.directionId === 1)!;
    expect(oneRowMainStretchHeadway({ realTier: [irvington], span: [] }, 'overnight')).toBeNull();
  });
});
