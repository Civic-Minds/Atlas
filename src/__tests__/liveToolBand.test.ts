import { describe, expect, it } from 'vitest';
import { liveBandNow } from '../LiveToolPage';
import { PERIOD_BANDS_ONLY } from '../components/Live/sections/figures';

// CIV-1451: the Live map's time menu matches the map: no All day, opening on the agency's current period.
describe('Live map time of day', () => {
  it('offers the periods only, never All day', () => {
    expect(PERIOD_BANDS_ONLY.map(([k]) => k)).toEqual(['amPeak', 'midday', 'pmPeak', 'evening']);
  });
  it('opens on the agency\'s current period; Late and Overnight open on Evening, the last period Live measures', () => {
    const at = (iso: string) => liveBandNow('America/Toronto', new Date(iso));
    expect(at('2026-11-13T13:30:00Z')).toBe('amPeak'); // 8:30 AM Toronto
    expect(at('2026-11-13T17:00:00Z')).toBe('midday'); // noon
    expect(at('2026-11-13T21:00:00Z')).toBe('pmPeak'); // 4 PM
    expect(at('2026-11-14T01:00:00Z')).toBe('evening'); // 8 PM
    expect(at('2026-11-14T04:30:00Z')).toBe('evening'); // 11:30 PM, Late
    expect(at('2026-11-14T08:00:00Z')).toBe('evening'); // 3 AM, Overnight
  });
});
