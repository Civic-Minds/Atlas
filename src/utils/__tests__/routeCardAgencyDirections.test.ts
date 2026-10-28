import { describe, expect, it } from 'vitest';
import { buildDirectionGroups } from '../routeCardDirectionGroups';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

// RFTA HC Hunter Creek (CIV-974): both directions carry the trip headsign "Hunter Creek Loop"; direction 0 leaves Rubey
// Park (Outbound), direction 1 returns to it (Inbound). Direction 0's line ends further east, so line ends alone list it second.
const base = { routeId: 'HC', routeShortName: 'HC', routeLongName: 'Hunter Creek', tier: '20', headway: 20, headsign: 'Hunter Creek Loop' };
const outbound = { ...base, directionId: 0 } as ShapeProperties;
const inbound = { ...base, directionId: 1 } as ShapeProperties;
const line = (from: number, to: number) => ({ type: 'LineString' as const, coordinates: Array.from({ length: 20 }, (_, i) => [from + ((to - from) * i) / 19, 39.19]) });
const route = {
  directions: [outbound, inbound],
  features: [
    { type: 'Feature' as const, properties: outbound, geometry: line(-106.82, -106.81) },
    { type: 'Feature' as const, properties: inbound, geometry: line(-106.81, -106.83) },
  ],
};
const labels = { '0': 'Outbound', '1': 'Inbound' };

describe('agency direction overrides on the route card', () => {
  it('lists Outbound first when the agency names its directions Outbound and Inbound', () => {
    expect(buildDirectionGroups(route, 'all', labels).map(g => g.boundLabel)).toEqual(['Outbound', 'Inbound']);
  });
  it('keeps the line-end order for other labels', () => {
    expect(buildDirectionGroups(route, 'all').map(g => g.dirId)).toEqual([1, 0]);
  });
  it('gives a direction the agency\'s destination where its trip headsign names the other end', () => {
    const groups = buildDirectionGroups(route, 'all', labels, { '1': 'Rubey Park' });
    expect(groups.map(g => [g.boundLabel, g.realTier.map(d => d.headsign)])).toEqual([
      ['Outbound', ['Hunter Creek Loop']],
      ['Inbound', ['Rubey Park']],
    ]);
  });
});
