import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { findChainedTripEnds, processGtfsBuffer } from '../process-core';

// TTC 47 Lansdowne (real feed 20261031, route 47, weekday service 1, shapes thinned). TTC splits
// each run at Lansdowne Station: southbound a bus runs 16600 -> 5224 on shape 1122805 (arriving,
// say, 10:52) and leaves 5224 at 10:54 on the next trip of the same block (shape 1122804). Both
// times landed at stop 5224, so the direction's period headways read every 2-3 min against
// its every 7 (#341). Hand count, Wed Oct 14 2026: southbound buses about every 7 at midday.
async function fixtureZip(): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', 'ttc-47-chained-trips');
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('chained trips of one block', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts a bus once where it ends one trip and starts the next (TTC 47 Lansdowne)', async () => {
    const result = await processGtfsBuffer(await fixtureZip(), undefined, { slug: 'ttc' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeId === '47' && p.day === 'Weekday' && p.stopId == null);
    for (const direction of weekday) {
      expect(direction.headway).toBe(7);
      expect(direction.headwayByPeriod.midday).toBeGreaterThanOrEqual(6);
    }
    expect(weekday).toHaveLength(2);
  });
});

describe('findChainedTripEnds', () => {
  // Trip A runs X -> Y and ends at Y at 10:52; trip B leaves Y at `leave` toward Z.
  const stopTimes = (leave: string) => new Map([
    ['A', [{ stop_id: 'X', stop_sequence: 1, departure_time: '10:30:00' }, { stop_id: 'Y', stop_sequence: 2, arrival_time: '10:52:00' }]],
    ['B', [{ stop_id: 'Y', stop_sequence: 1, departure_time: leave }, { stop_id: 'Z', stop_sequence: 2, arrival_time: '11:10:00' }]],
  ]);
  const firstDeparture = new Map([['A', 630], ['B', 654]]);
  const trip = (trip_id: string, block_id?: string) =>
    ({ trip_id, route_id: '47', service_id: '1', direction_id: '0', trip_headsign: 'Queen', block_id });

  it('chains a same-block hand-over within 10 minutes', () => {
    const chained = findChainedTripEnds([trip('A', 'b1'), trip('B', 'b1')], stopTimes('10:54:00'), firstDeparture);
    expect([...chained]).toEqual([['A|Y|2', true]]);
  });

  it('keeps both departures when the feed has no block_id', () => {
    expect(findChainedTripEnds([trip('A'), trip('B')], stopTimes('10:54:00'), firstDeparture).size).toBe(0);
  });

  it('keeps both departures for two different blocks at the same stop', () => {
    expect(findChainedTripEnds([trip('A', 'b1'), trip('B', 'b2')], stopTimes('10:54:00'), firstDeparture).size).toBe(0);
  });

  it('keeps both departures after a layover over 10 minutes', () => {
    expect(findChainedTripEnds([trip('A', 'b1'), trip('B', 'b1')], stopTimes('11:03:00'), new Map([['A', 630], ['B', 663]])).size).toBe(0);
  });
});
