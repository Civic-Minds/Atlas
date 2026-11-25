import { describe, expect, it } from 'vitest';
import worker from './index';
import { liveCloudServes, liveCloudServesVehicles } from '../../../shared/liveCloud';
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION } from '../../../shared/liveContract';

// CIV-2914 (manager's condition, CIV-1716): the public Live reader never serves an analysis-only agency, whatever its
// buckets hold: Kingston (the Studio demo) is on the recorder and has Live analysis files, and must still read as 404.
const env = { LIVE_ARCHIVE: { get: async () => { throw new Error('must not read'); } }, MCP_LIVE: { get: async () => { throw new Error('must not read'); } } } as never;

describe('atlas-live-read serves only agencies Live shows', () => {
  it('never serves Kingston, on any route', async () => {
    expect(liveCloudServes('kingston')).toBe(false);
    expect(liveCloudServesVehicles('kingston')).toBe(false);
    for (const path of ['/live/vehicles?agency=kingston', '/live/segments?agency=kingston&route=701', '/live/dashboard?agency=kingston&route=701', '/live/recent?agency=kingston&route=701', '/live/agency?agency=kingston', '/live/gaps?agency=kingston&route=701', '/live/stop?agency=kingston&stop=1']) {
      const res = await worker.fetch(new Request(`https://x.test${path}`), env);
      expect(res.status, path).toBe(404);
    }
  });
  it('serves the agencies Live shows', () => {
    expect(liveCloudServesVehicles('ttc')).toBe(true);
    expect(liveCloudServes('hamilton')).toBe(true);
  });
});

describe('the whole-network count (CIV-2939)', () => {
  const snap = (key: string) => {
    const capturedAt = Number(key.split('/').at(-1)!.replace('.json', ''));
    return JSON.stringify({ schemaVersion: LIVE_SNAPSHOT_V2_SCHEMA_VERSION, agency: 'ttc', capturedAt, sourceTimestamp: null, tripsTimestamp: null, paceSec: 30, tripsOk: true, headways: {}, records: [], network: { onTrip: 1502, noTrip: 231 } });
  };
  const countEnv = { LIVE_ARCHIVE: { get: async (key: string) => (key.startsWith('live/ttc/') ? { arrayBuffer: async () => new TextEncoder().encode(snap(key)).buffer } : null) }, MCP_LIVE: {} } as never;
  it('serves the latest snapshot\'s count for an agency Live shows, in the same answer as before', async () => {
    const res = await worker.fetch(new Request('https://x.test/live/network-count?agency=ttc'), countEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, number | string>;
    expect(Object.keys(body).sort()).toEqual(['ageSec', 'agency', 'at', 'noTrip', 'vehicles']);
    expect(body).toMatchObject({ agency: 'ttc', vehicles: 1502, noTrip: 231 });
  });
  it('never serves Kingston or an agency the recorder does not record', async () => {
    for (const agency of ['kingston', 'stm', '']) {
      const res = await worker.fetch(new Request(`https://x.test/live/network-count?agency=${agency}`), env);
      expect(res.status, agency).toBe(404);
    }
  });
});
