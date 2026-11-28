import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { BRANCH_READINGS_ENABLED } from '../../../shared/rules/flags';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeReading } from '../routeReading';
import b35json from './fixtures/nyct-b35-sunday.json';
import ac40json from './fixtures/actransit-40-weekday.json';
import ttc52json from './fixtures/ttc-52-saturday.json';

// #1825: every range end and every line's number comes from that row's own reading, in the Node readers (the MCP, the agency
// pages, schedule_changes) as on the live card. Both fixtures are release-mwvbser2, properties only.
const rows = (json: unknown) => {
  const features = (json as GeoJSON.FeatureCollection).features;
  normalizeRouteFilterFeatures(features as never);
  return features.map(f => f.properties as unknown as ShapeProperties);
};

describe('route reading from each row\'s own reading (#1825)', () => {
  it('reads the branch-readings rules outside the browser too (no VITE_ variable in Node)', () => {
    expect(BRANCH_READINGS_ENABLED).toBe(true);
    // One switch for the browser and Node: a VITE_ variable reads as off in Node, so the two would disagree again.
    expect(readFileSync(new URL('../../../shared/rules/flags.ts', import.meta.url), 'utf8')).not.toMatch(/VITE_BRANCH_READINGS_ENABLED/);
  });
  it('B35 Sunday midday: the Limited branch runs every 12 from 12:57 PM, so the range ends at a row\'s own number (was "every 237")', () => {
    const reading = routeReading(rows(b35json), 'midday');
    expect(reading.text(false)).toBe('every 8–24 min');
  });
  it('AC Transit 40 weekday AM peak: Eastmont\'s 7 uneven trips get no number (rule D), so the list never reads "every 45"', () => {
    const reading = routeReading(rows(ac40json), 'amPeak');
    expect(reading.text(false)).toBe('every 10–21 min');
  });
  it('TTC 52 Saturday evening: the Sunnybrook branch\'s "every 20 min until 7:45 PM" counts as 20, not its full-window 195, so the list reads the card\'s 7–22', () => {
    expect(routeReading(rows(ttc52json), 'evening').text(false)).toBe('every 7–22 min');
  });
});
