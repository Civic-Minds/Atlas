import { describe, expect, it } from 'vitest';
import { buildOnDemandRelease } from '../onDemandExport';

/**
 * CIV-1427: every trip rule is one of three sentences, only the place names change (Ryan: "some notices say 'can go'
 * and some stay 'start and end'"). How riders board belongs to the pickup line, booking to Booking and hours to
 * Service hours, so none of it is repeated here.
 */
export const TRIP_RULE_TEMPLATES = [
  /^Trips can start and end anywhere in [^,.]+\.$/,
  /^Trips can start and end anywhere in [^,.]+, or at [^.]+ outside it\.$/,
  /^Trips must start or end at [^.]+\.$/,
];

// Lines that only say the agency doesn't say something; when it doesn't, the card says nothing.
const UNKNOWN_NOTE = /not stated|n't confirmed|not confirmed|left unset|is unclear|does not publish|lists no/i;

describe('on-demand trip rules and notes', () => {
  const services = buildOnDemandRelease('beta').index.services;
  const entries = services.flatMap(s => [s.area, ...Object.values(s.area.zoneMetadata ?? {})] as { tripRules?: string; hoursNote?: string }[]);
  const rules = entries.map(e => e.tripRules).filter((rule): rule is string => !!rule);

  it('every trip rule is one of the three templates', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(TRIP_RULE_TEMPLATES.some(t => t.test(rule)), rule).toBe(true);
  });

  it('no hours note says only that something is not stated', () => {
    for (const note of entries.map(e => e.hoursNote).filter(Boolean)) expect(note).not.toMatch(UNKNOWN_NOTE);
  });
});
