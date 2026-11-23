import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

/**
 * CIV-2073: a small Hamilton feed pair for the recorder's tests: two vehicles on Live route 01 (route_id 5677) (one matched to its
 * trip update by trip id, one only by vehicle id), one on a route Live doesn't name, a stop with no time, and a second
 * trip on route 01 with stops at the same stops, so headways are observed.
 */
export const FIXTURE_NOW = 1_795_000_000;
const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const T = FIXTURE_NOW;

export function fixturePositions(): Uint8Array {
  return FeedMessage.encode(FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: T },
    entity: [
      { id: 'a', vehicle: { trip: { tripId: 't1', routeId: '5677', directionId: 0 }, position: { latitude: 43.25, longitude: -79.87, bearing: 90 }, timestamp: T - 20, vehicle: { id: 'v1', label: '0401' } } },
      { id: 'b', vehicle: { trip: { tripId: 'tX', routeId: '5677', directionId: 1 }, position: { latitude: 43.26, longitude: -79.86 }, timestamp: T - 5, vehicle: { id: 'v2' } } },
      { id: 'c', vehicle: { trip: { tripId: 't9', routeId: '99' }, position: { latitude: 43.2, longitude: -79.8 }, timestamp: T - 1, vehicle: { id: 'v3' } } },
      // At its trip's last stop: its own update has nothing ahead, the next trip's (same vehicle) does (#1673).
      { id: 'd', vehicle: { trip: { tripId: 't4', routeId: '5677', directionId: 0 }, position: { latitude: 43.27, longitude: -79.85 }, timestamp: T - 3, currentStatus: 1, vehicle: { id: 'v4' } } },
    ],
  })).finish();
}

export function fixtureTrips(): Uint8Array {
  return FeedMessage.encode(FeedMessage.create({
    // 15 s older than the positions, as feeds often are: a stop between the two is still ahead in the feed (#1673).
    header: { gtfsRealtimeVersion: '2.0', timestamp: T - 15 },
    entity: [
      { id: 'u1', tripUpdate: { trip: { tripId: 't1', routeId: '5677' }, delay: 120, stopTimeUpdate: [
        { stopId: '100', arrival: { time: T - 60 } }, { stopId: '099', arrival: { time: T - 10 } }, { stopId: '101', arrival: { time: T + 60 } }, { stopId: '102' }, { stopId: '103', departure: { time: T + 300 } },
      ] } },
      { id: 'u2', tripUpdate: { trip: { tripId: 't2', routeId: '5677' }, vehicle: { id: 'v2' }, stopTimeUpdate: [
        { stopId: '101', arrival: { time: T + 600, delay: -30 } }, { stopId: '101', arrival: { time: T + 1200 } }, { stopId: '103', arrival: { time: T + 900 } },
      ] } },
      { id: 'u4', tripUpdate: { trip: { tripId: 't4', routeId: '5677' }, vehicle: { id: 'v4' }, stopTimeUpdate: [
        { stopId: '103', arrival: { time: T - 120 }, departure: { time: T + 30 } },
      ] } },
      { id: 'u5', tripUpdate: { trip: { tripId: 't5', routeId: '5677' }, vehicle: { id: 'v4' }, stopTimeUpdate: [
        { stopId: '102', arrival: { time: T + 400 } },
      ] } },
    ],
  })).finish();
}
