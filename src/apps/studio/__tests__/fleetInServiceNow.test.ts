import { describe, expect, it } from 'vitest';
import { busRows } from '../StudioGroupFigures';
import { agencyRouteCount, agencyRoutes } from '../fleetModel';
import type { StudioVehiclesFile } from '../../../../shared/studioVehicles';
import { liveFollowsRoute } from '../../../../shared/livePollingConfig';
import type { StudioVehicleGroup } from '../../../../shared/studioVehicles';

const g: StudioVehicleGroup = { routes: ['501'], modes: [0], scheduled: 20, implied: 21, runningMin: 180, layoverMin: 12, atTarget: { 5: 40, 10: 20, 15: 14 } };

describe('Fleet: in service now (CIV-2056)', () => {
  it('puts the live count straight under the schedule\'s row, and leaves it out without one', () => {
    const labels = busRows(g, 'current', 18).map(r => r.label);
    expect(labels[labels.indexOf('As scheduled') + 1]).toBe('In service now');
    expect(busRows(g, 'current', 18).find(r => r.key === 'live')?.value).toBe(18);
    expect(busRows(g).some(r => r.key === 'live')).toBe(false);
  });
  it('counts only routes Live reads every vehicle of', () => {
    expect(liveFollowsRoute('ttc', '501')).toBe(true);
    expect(liveFollowsRoute('ttc', '29')).toBe(false);
    expect(liveFollowsRoute('kingston', '502')).toBe(true);
    expect(liveFollowsRoute('nowhere', '1')).toBe(false);
  });
  it('the network total counts every route running at the time of day', () => {
    const file = { periods: { midday: [{ ...g, routes: ['501', '504'] }, { ...g, routes: ['505'] }] } } as unknown as StudioVehiclesFile;
    expect(agencyRoutes(file, 'midday')).toEqual(['501', '504', '505']);
    expect(agencyRouteCount(file, 'midday')).toBe(3);
    expect(agencyRoutes(file, 'evening')).toEqual([]);
  });
});
