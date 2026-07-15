import { describe, it, expect } from 'vitest';
import {
  delayFromTripUpdate,
  delayMinFromDelaySec,
  explicitTripDelaySec,
  gtfsTimeToSec,
  scheduledDelaySec,
  serviceDayStartEpoch,
} from '../liveVehicleDelay';
import { vehicleHeadwayGapMin } from '../liveHeadway';

describe('liveVehicleDelay', () => {
  it('parses GTFS times past midnight', () => {
    expect(gtfsTimeToSec('25:30:00')).toBe(25 * 3600 + 30 * 60);
  });

  it('reads explicit delay fields', () => {
    const tu = {
      stopTimeUpdate: [{ arrival: { delay: 120, time: '1000' } }],
    };
    expect(explicitTripDelaySec(tu)).toBe(120);
  });

  it('infers delay from predicted vs scheduled time', () => {
    const serviceDayStart = 1_700_000_000;
    const stopSec = gtfsTimeToSec('08:30:00');
    const predicted = serviceDayStart + stopSec + 180; // 3 min late
    const tripStopTimes = { trip1: { '5612': stopSec } };

    const delaySec = scheduledDelaySec(predicted, 'trip1', '5612', tripStopTimes, serviceDayStart);
    expect(delaySec).toBe(180);
    expect(delayMinFromDelaySec(delaySec!)).toBe(3);
  });

  it('uses vehicle stop context in trip updates without delay fields', () => {
    const serviceDayStart = 1_700_000_000;
    const stopSec = gtfsTimeToSec('10:15:00');
    const predicted = serviceDayStart + stopSec - 60;
    const tu = {
      trip: { tripId: '1373020' },
      stopTimeUpdate: [
        { stopId: '5612', stopSequence: 20, arrival: { time: String(predicted) } },
      ],
    };
    const tripStopTimes = { '1373020': { '5612': stopSec } };

    const delaySec = delayFromTripUpdate(tu, tripStopTimes, serviceDayStart, {
      stopId: '5612',
      currentStatus: 'INCOMING_AT',
    });
    expect(delaySec).toBe(-60);
    expect(delayMinFromDelaySec(delaySec!)).toBe(-1);
  });

  it('computes service day start in a timezone', () => {
    // 2024-01-15 15:00 UTC → morning in Toronto on same calendar day
    const start = serviceDayStartEpoch(1_705_324_800, 'America/Toronto');
    expect(start).toBeLessThan(1_705_324_800);
    expect(1_705_324_800 - start).toBeGreaterThan(0);
    expect(1_705_324_800 - start).toBeLessThan(24 * 3600);
  });

  it('computes the gap to the next vehicle on a route shape', () => {
    const shape = { coordinates: [[0, 0], [0.01, 0]] as [number, number][] };
    const gap = vehicleHeadwayGapMin(
      { id: 'a', lat: 0, lon: 0, speedKmh: 30, directionId: 0 },
      [
        { id: 'a', lat: 0, lon: 0, speedKmh: 30, directionId: 0 },
        { id: 'b', lat: 0, lon: 0.007, speedKmh: 30, directionId: 0 },
      ],
      shape,
    );
    expect(gap).toBeCloseTo(2.2, 1);
  });
});
