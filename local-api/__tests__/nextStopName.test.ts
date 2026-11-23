import { describe, expect, it } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { FEED_DECODE_OPTIONS, isStoppedAt, nextStopName, stoppedAtName, vehicleNextStop } from '../live-vehicles.js';

const names = new Map([['2140', { name: 'Dundas St West at Bathurst St' }], ['2147', { name: 'Dundas St West at Beverley St' }]]);
const stops = [
  { stopId: '2140', arrival: { time: 1000 } },
  { stopId: '9999', arrival: { time: 1050 } },
  { stopId: '2147', arrival: { time: 1100 } },
];
describe('next stop on the vehicle card (CIV-2024, #1653)', () => {
  it("names the trip update's first stop still ahead", () => {
    expect(nextStopName({ currentStatus: 2 }, stops, names, 900)).toBe('Dundas St West at Bathurst St');
  });
  it('skips stops already passed and stops the agency file does not name', () => {
    expect(nextStopName({ currentStatus: 0 }, stops, names, 1001)).toBe('Dundas St West at Beverley St');
  });
  it('gives none while it stands at a stop, without a trip update, or with no named stop ahead', () => {
    expect(nextStopName({ currentStatus: 1 }, stops, names, 900)).toBeNull();
    expect(nextStopName({ currentStatus: 2 }, undefined, names, 900)).toBeNull();
    expect(nextStopName({ currentStatus: 2 }, stops, names, 1200)).toBeNull();
  });
});

describe("next stop at a trip's end (#1673)", () => {
  const ended = { stopTimeUpdate: [{ stopId: '2140', arrival: { time: 800 } }] };
  const nextTrip = { stopTimeUpdate: [{ stopId: '2147', departure: { time: 1300 } }] };
  it("reads the vehicle's next trip when every stop of its own trip is past", () => {
    expect(vehicleNextStop({ currentStatus: 2 }, ended, [ended, nextTrip], names, 900)).toEqual({ name: 'Dundas St West at Beverley St', at: false });
  });
  it("keeps its own trip's stop while one is still ahead", () => {
    expect(vehicleNextStop({ currentStatus: 2 }, { stopTimeUpdate: stops }, [nextTrip], names, 900)).toEqual({ name: 'Dundas St West at Bathurst St', at: false });
  });
  it('falls back to the vehicle id match', () => {
    expect(vehicleNextStop({ currentStatus: 2 }, undefined, [nextTrip], names, 900)).toEqual({ name: 'Dundas St West at Beverley St', at: false });
  });
});

describe('"At <stop>" while the vehicle stands at a stop (CIV-2034)', () => {
  it('names the stop it has not yet left: arrived, departure still ahead', () => {
    const dwelling = [{ stopId: '2140', arrival: { time: 890 }, departure: { time: 910 } }, { stopId: '2147', arrival: { time: 1000 } }];
    expect(stoppedAtName(dwelling, names, 900)).toBe('Dundas St West at Bathurst St');
    expect(vehicleNextStop({ currentStatus: 1 }, { stopTimeUpdate: dwelling }, undefined, names, 900)).toEqual({ name: 'Dundas St West at Bathurst St', at: true });
  });
});

// #1739: a live feed decodes current_status as its name ("STOPPED_AT"); comparing it with the number 1 was never true.
describe('stop status from a decoded feed (#1739)', () => {
  const VehiclePosition = GtfsRealtimeBindings.transit_realtime.VehiclePosition;
  function decodedStatus(currentStatus: number): unknown {
    const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
    const bytes = FeedMessage.encode(FeedMessage.create({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 900 },
      entity: [{ id: 'v1', vehicle: { vehicle: { id: '4400' }, trip: { tripId: 't1' }, currentStatus } }],
    })).finish();
    return FeedMessage.toObject(FeedMessage.decode(bytes), FEED_DECODE_OPTIONS).entity[0].vehicle.currentStatus;
  }

  it('reads a decoded STOPPED_AT as standing at the stop, and the card says "At <stop>"', () => {
    const status = decodedStatus(VehiclePosition.VehicleStopStatus.STOPPED_AT);
    expect(status).toBe('STOPPED_AT');
    expect(isStoppedAt(status as string)).toBe(true);
    const dwelling = [{ stopId: '2140', arrival: { time: 880 }, departure: { time: 930 } }];
    expect(vehicleNextStop({ currentStatus: status as string }, { stopTimeUpdate: dwelling }, undefined, names, 900))
      .toEqual({ name: 'Dundas St West at Bathurst St', at: true });
    expect(nextStopName({ currentStatus: status as string }, stops, names, 900)).toBeNull();
  });

  it('still reads the recorder\'s number, and nothing else, as stopped', () => {
    expect(isStoppedAt(VehiclePosition.VehicleStopStatus.STOPPED_AT)).toBe(true);
    for (const other of [VehiclePosition.VehicleStopStatus.INCOMING_AT, VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO]) {
      expect(isStoppedAt(decodedStatus(other) as string)).toBe(false);
      expect(isStoppedAt(other)).toBe(false);
    }
    expect(isStoppedAt(null)).toBe(false);
    expect(isStoppedAt(undefined)).toBe(false);
  });
});
