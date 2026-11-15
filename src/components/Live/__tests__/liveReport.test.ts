// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { liveRouteReportDetails, liveVehicleReportDetails } from '../liveReport';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';

// CIV-932: a Live report says which route, which vehicles and when, so the moment can be found in the feed.
const vehicle: LiveVehicle = {
  id: '4401', routeShortName: '505', displayName: '505', tripId: 'T1', lat: 43.65, lon: -79.4, bearing: null, speedKmh: null,
  tsEpoch: 1793300000, delayMin: 4, headsign: 'Broadview Station', directionId: 0, vehicleLabel: '4401', status: 'late', agencySlug: 'ttc',
};
const now = new Date('2026-10-30T14:00:00Z');

describe('Live report details', () => {
  it('route card: route, direction, time and every vehicle with trip, delay and position time', () => {
    const text = liveRouteReportDetails({ agencySlug: 'ttc', agencyName: 'Toronto Transit Commission', routeShortName: '505', direction: null, vehicles: [vehicle], now });
    expect(text).toContain('**Route:** 505');
    expect(text).toContain('**Direction:** all');
    expect(text).toContain('**Reported at:** 2026-10-30T14:00:00.000Z');
    expect(text).toContain(`- 4401 (vehicle 4401, trip T1, direction 0, Broadview Station): late, 4 min, position sent ${new Date(1793300000 * 1000).toISOString()}`);
    expect(text.trim().split('\n').at(-1)).toMatch(/^\*\*Atlas URL:\*\* /);
  });

  it('vehicle card: the one vehicle and its position', () => {
    const text = liveVehicleReportDetails({ agencySlug: 'ttc', agencyName: 'Toronto Transit Commission', routeShortName: '505', vehicle, now });
    expect(text).toContain('**Position:** 43.65000,-79.40000');
    expect(text).toContain('trip T1');
  });
});
