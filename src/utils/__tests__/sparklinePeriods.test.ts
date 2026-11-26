import { describe, expect, it } from 'vitest';
import { periodValuesByHour } from '../sparklinePeriods';

// CIV-2973: Studio Fleet's two charts spread one figure per time of day over the hours through one helper.
describe('periodValuesByHour', () => {
  it('gives each hour its time of day\'s figure, null where there is none', () => {
    const byHour = periodValuesByHour({ amPeak: 10, midday: 15, pmPeak: null });
    expect(byHour[7]).toBe(10);
    expect(byHour[12]).toBe(15);
    expect(byHour[17]).toBeNull();
    expect(byHour[21]).toBeNull();
  });
});
