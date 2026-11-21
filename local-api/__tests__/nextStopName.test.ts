import { describe, expect, it } from 'vitest';
import { nextStopName } from '../live-vehicles.js';

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
