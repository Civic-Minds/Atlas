import { describe, expect, it } from 'vitest';
import { historyAgencyPath, liveMapAgencyPath } from '../pagePaths';
import { parseAgencyCardParam } from '../../src/utils/shareUrlState';
import { studioPath } from '../studioAgencies';

describe('Coverage pill links (CIV-2008)', () => {
  it('History and the Live map open on the agency through the map address', () => {
    expect(historyAgencyPath('ttc')).toBe('/apps/history?operator=ttc');
    expect(liveMapAgencyPath('ttc')).toBe('/apps/live?operator=ttc');
    expect(parseAgencyCardParam(historyAgencyPath('ttc').split('?')[1])).toBe('ttc');
  });
  it('Studio Schedule and Vehicles open Schedules and Fleet for the agency', () => {
    expect(studioPath({ page: 'schedules', agency: 'ttc', route: null })).toBe('/studio/schedules/ttc');
    expect(studioPath({ page: 'fleet', agency: 'ttc', route: null })).toBe('/studio/fleet/ttc');
  });
});
