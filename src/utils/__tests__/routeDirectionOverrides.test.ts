import { describe, expect, it } from 'vitest';
import { routeDirectionOverrides } from '../routeCardDirectionGroups';

const agencies = [
  { slug: 'rfta', directionLabels: { HC: { '0': 'Downvalley' } }, directionHeadsigns: { HC: { '1': 'Aspen' } } },
  { slug: 'ttc' },
];

describe('routeDirectionOverrides (CIV-985)', () => {
  it('returns both overrides for the route from its agency', () => {
    expect(routeDirectionOverrides(agencies, 'rfta', 'HC')).toEqual({ directionLabels: { '0': 'Downvalley' }, directionHeadsigns: { '1': 'Aspen' } });
  });
  it('returns nothing for another route, an agency without overrides, or no agency', () => {
    expect(routeDirectionOverrides(agencies, 'rfta', 'BRT')).toEqual({ directionLabels: undefined, directionHeadsigns: undefined });
    expect(routeDirectionOverrides(agencies, 'ttc', '504')).toEqual({ directionLabels: undefined, directionHeadsigns: undefined });
    expect(routeDirectionOverrides(agencies, undefined, 'HC')).toEqual({ directionLabels: undefined, directionHeadsigns: undefined });
  });
});
