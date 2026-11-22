import { describe, expect, it } from 'vitest';
import { nextStopName, vehicleNextStop } from '../live-vehicles.js';

const names = new Map([['2140', 'Dundas St West at Bathurst St'], ['2147', 'Dundas St West at Beverley St']]);
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
    expect(vehicleNextStop({ currentStatus: 2 }, ended, [ended, nextTrip], names, 900)).toBe('Dundas St West at Beverley St');
  });
  it("keeps its own trip's stop while one is still ahead", () => {
    expect(vehicleNextStop({ currentStatus: 2 }, { stopTimeUpdate: stops }, [nextTrip], names, 900)).toBe('Dundas St West at Bathurst St');
  });
  it('falls back to the vehicle id match, and gives none while stopped', () => {
    expect(vehicleNextStop({ currentStatus: 2 }, undefined, [nextTrip], names, 900)).toBe('Dundas St West at Beverley St');
    expect(vehicleNextStop({ currentStatus: 1 }, ended, [nextTrip], names, 900)).toBeNull();
  });
});
