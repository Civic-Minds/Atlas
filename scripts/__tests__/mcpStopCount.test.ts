import { describe, expect, it } from 'vitest';
import { stopCount } from '../mcp/atlasData';

// #1778: OC Transpo Line 1's stop list holds each station twice, its platform (NA999) and the parent station Atlas copies the
// platform's departures up to (3011_stn), so route_frequency said 26 stops for a 13-station line.
describe('route_frequency counts a station once (#1778)', () => {
  const parentOf = new Map([['NA999', '3011_stn'], ['NA995', '3060_stn'], ['EE995', '3027_stn']]);
  it('leaves out a parent station whose own platform is in the same list', () => {
    expect(stopCount(['3011_stn', 'NA999', '3060_stn', 'NA995', 'EE995', '3027_stn'], parentOf)).toBe(3);
  });
  it('keeps a parent station with none of its platforms in the list, and stops with no parent', () => {
    expect(stopCount(['3011_stn', '3060_stn', 'NA995', 'bus-stop'], parentOf)).toBe(3);
    expect(stopCount(['a', 'b', 'c'], new Map())).toBe(3);
  });
});
