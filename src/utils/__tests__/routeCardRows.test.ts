import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { buildRouteCardModel, matchesHoveredBranch, rowIsHovered, sharedIsHovered } from '../routeCardRows';

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
});
