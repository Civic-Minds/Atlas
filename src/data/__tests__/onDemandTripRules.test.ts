import { describe, expect, it } from 'vitest';
import { buildOnDemandRelease } from '../onDemandExport';

// CIV-1427: Trip rules say only where a trip can go, in one pattern ("Trips ..."). How riders board belongs to the
// pickup sentence, booking to Booking and hours to Service hours, so none of it repeats here.
describe('on-demand trip rules', () => {
  const services = buildOnDemandRelease('beta').index.services;
  const rules = services.flatMap(s => [s.area.tripRules, ...Object.values(s.area.zoneMetadata ?? {}).map(z => (z as { tripRules?: string }).tripRules)])
    .filter((rule): rule is string => !!rule);

  it('every rule starts with "Trips"', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toMatch(/^Trips /);
  });

  it('no rule repeats the pickup method, booking or hours', () => {
    for (const rule of rules) expect(rule).not.toMatch(/door to door|curb to curb|\bbook|reservation|in advance|\d(:\d\d)? ?(AM|PM)/i);
  });
});
