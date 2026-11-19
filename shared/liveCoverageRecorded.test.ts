import { describe, expect, it } from 'vitest';
import { routeIsRecorded } from './liveCoverage';

describe('routeIsRecorded (CIV-1928)', () => {
  it('knows the TTC streetcars are recorded and a bus like the 29 is not', () => {
    expect(routeIsRecorded('ttc', ['504'])).toBe(true);
    expect(routeIsRecorded('ttc', ['29'])).toBe(false);
  });
  it('counts every route of an agency whose feed keeps them all, and none of an agency Live does not record', () => {
    expect(routeIsRecorded('hamilton', ['5829'])).toBe(true);
    expect(routeIsRecorded('not-recorded', ['1'])).toBe(false);
  });
});
