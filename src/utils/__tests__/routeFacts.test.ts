import { describe, expect, it } from 'vitest';
import { buildRouteFacts, routeFactsFromFeature } from '../routeFacts';

describe('routeFacts', () => {
  it('provides one stable identity and consistent fallbacks', () => {
    const facts = buildRouteFacts({
      routeId: '900',
      directionId: 0,
      tier: '5',
      headway: 5,
      routeShortName: null,
      routeLongName: null,
      agencyName: 'TTC',
    });

    expect(facts).toMatchObject({
      key: 'TTC::900',
      agencySlug: 'TTC',
      agencyName: 'TTC',
      routeId: '900',
      shortName: '900',
      longName: null,
      headway: 5,
    });
  });

  it('uses the layer slug as the canonical agency identity', () => {
    const facts = buildRouteFacts({
      routeId: '1',
      directionId: 0,
      tier: null,
      headway: null,
      routeShortName: '1',
      routeLongName: 'Main',
      agencyName: 'Display Name',
    }, 'agency-slug');

    expect(facts.key).toBe('agency-slug::1');
    expect(facts.agencyName).toBe('Display Name');
  });

  it('returns no facts for stop-only features', () => {
    expect(routeFactsFromFeature({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-79, 43] },
      properties: { stopId: 'stop-1' },
    })).toBeNull();
  });
});
