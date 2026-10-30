import { describe, expect, it } from 'vitest';
import { nearYouReportDetails } from '../NearbyRoutesPanel';
import type { NearbyRoute } from '../../../hooks/useNearbyRoutes';

// CIV-932: a report from Near You says where the list was read and what it listed.
describe('Near You report details', () => {
  const route = (over: Partial<NearbyRoute>): NearbyRoute => ({
    rKey: 'ttc:505::0', routeShortName: '505', displayShortName: '505', routeLongName: 'Dundas', agencyName: 'TTC', agencySlug: 'ttc',
    headway: 10, limited: false, tier: '10', nearestStopName: 'Dundas St West at Bathurst St', distanceMeters: 120, ...over,
  });

  it('sends the point, day, period and every listed route with its stop and value', () => {
    const text = nearYouReportDetails([route({}), route({ rKey: 'ttc:511::0', routeShortName: '511', displayShortName: '511', routeLongName: 'Bathurst', limited: true, headway: null, distanceMeters: 42 })],
      { lat: 43.652, lon: -79.4067 }, 'Weekday', 'midday');
    expect(text).toContain('**Point:** 43.65200,-79.40670');
    expect(text).toContain('**Day:** Weekday');
    expect(text).toContain('**Period:** midday');
    expect(text).toContain('- TTC 505 Dundas (ttc:505::0): every 10 min, nearest stop Dundas St West at Bathurst St, 120 m');
    expect(text).toContain('- TTC 511 Bathurst (ttc:511::0): limited, nearest stop Dundas St West at Bathurst St, 42 m');
    expect(text.trim().split('\n').at(-1)).toMatch(/^\*\*Atlas URL:\*\* /);
  });

  it('says when nothing is listed or the point is unknown', () => {
    const text = nearYouReportDetails([], null);
    expect(text).toContain('**Point:** unknown');
    expect(text).toContain('- Nothing listed');
  });
});
