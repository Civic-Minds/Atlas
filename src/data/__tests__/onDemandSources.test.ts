import { describe, expect, it } from 'vitest';
import { sourceProblems, type OnDemandSource } from '../onDemandSources';

const zone = (areaName: string) => ({ type: 'Feature', properties: { areaName, sourceUrl: 'x' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
const source = (zoneMetadata: Record<string, { validFrom?: string; validUntil?: string }>): OnDemandSource => ({
  slug: 'test',
  area: { serviceName: 'T', sourceUrl: 'x', sourceLabel: 'x', sourceRetrievedAt: '2026-11-16', zoneMetadata },
  features: [zone('A')],
} as unknown as OnDemandSource);

describe('zone date checks (CIV-1753)', () => {
  it('accepts a first day and a last day as YYYY-MM-DD', () => {
    expect(sourceProblems(source({ A: { validFrom: '2027-01-01', validUntil: '2027-06-30' } }))).toEqual([]);
  });

  it('flags a badly written date and a zone that starts after its last day', () => {
    expect(sourceProblems(source({ A: { validFrom: 'Jan 2027' } }))).toEqual(['test: zoneMetadata "A".validFrom must be YYYY-MM-DD']);
    expect(sourceProblems(source({ A: { validFrom: '2027-02-01', validUntil: '2027-01-31' } }))).toEqual(['test: zoneMetadata "A" starts after its last day']);
  });
});
