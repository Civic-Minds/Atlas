import { afterEach, describe, expect, it, vi } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import handler from '../live-vehicles.js';
import { LIVE_POLLING_ROUTES, liveConfigRouteIds } from '../../shared/livePollingConfig.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const NOW = 1_795_351_163;
const feed = (entity: object[]) => FeedMessage.encode(FeedMessage.create({ header: { gtfsRealtimeVersion: '2.0', timestamp: NOW }, entity })).finish();

afterEach(() => vi.restoreAllMocks());

describe('Live route ids follow the agency\'s current route file (#1696)', () => {
  it('adds every id the route file gives the route\'s short name to the listed ones', () => {
    const king = LIVE_POLLING_ROUTES.find(r => r.slug === 'hamilton' && r.displayRouteShortName === '01')!;
    const file = new Map([['5828', { shortName: '01' }], ['5829', { shortName: '10' }]]);
    expect(liveConfigRouteIds(king, file)).toEqual([...king.routeIds, '5828']);
    expect(liveConfigRouteIds(king, null)).toEqual(king.routeIds);
  });

  it('shows a Hamilton King bus whose feed uses the renumbered route id', async () => {
    const vp = feed([{ id: 'e1', vehicle: { trip: { tripId: 't1', routeId: '5828', directionId: 0 }, position: { latitude: 43.256, longitude: -79.87 }, timestamp: NOW, vehicle: { id: 'bus1', label: '0401' } } }]);
    const routeFile = { features: [{ properties: { routeId: '5828', routeShortName: '01', routeLongName: 'KING' } }] };
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: unknown) => {
      const url = String(u);
      if (url.endsWith('/hamilton.json')) return new Response(JSON.stringify(routeFile), { status: 200 });
      return new Response(new Uint8Array(/VehiclePositions/i.test(url) ? vp : feed([])).buffer, { status: 200 });
    });
    const body = await (await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=hamilton'))).json() as { vehicles: { id: string; routeShortName: string }[] };
    expect(body.vehicles.map(v => [v.id, v.routeShortName])).toEqual([['bus1', '01']]);
  });
});
