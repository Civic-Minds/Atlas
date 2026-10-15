import { afterEach, describe, expect, it, vi } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { computeLiveAdherence } from '../computeLiveAdherence.js';

const T = GtfsRealtimeBindings.transit_realtime;
// TTC 504 target stops (shared/livePollingConfig.ts): 3760 Dundas West Station, 6783 King & Niagara.
function feed(delays: (number | undefined)[]) {
  const stops = ['3760', '6783'];
  const msg = T.FeedMessage.fromObject({
    header: { gtfsRealtimeVersion: '2.0' },
    entity: [{
      id: '1',
      tripUpdate: {
        trip: { tripId: 't1', routeId: '504', directionId: 0 },
        stopTimeUpdate: stops.map((stopId, i) => ({ stopId, arrival: { time: 1000 + i * 600, ...(delays[i] != null ? { delay: delays[i] } : {}) } })),
      },
    }],
  });
  return T.FeedMessage.encode(msg).finish();
}
function stubFetch(body: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('live-polling')
    ? { ok: false, json: async () => null }
    : { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) })));
}

describe('computeLiveAdherence (#866)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats a missing delay as unknown, not on time', async () => {
    stubFetch(feed([undefined, undefined]));
    const r = (await computeLiveAdherence('ttc', '504'))!;
    expect(r.trips).toEqual([]); // no trip reads "0 min late" from absent delays
    expect(r.arrivals.length).toBeGreaterThan(0); // arrival gaps still use predicted times
  });

  it('still measures trips whose delays are given', async () => {
    stubFetch(feed([60, 180]));
    const r = (await computeLiveAdherence('ttc', '504'))!;
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0].entryDelayMin).toBe(1);
    expect(r.trips[0].exitDelayMin).toBe(3);
  });
});
