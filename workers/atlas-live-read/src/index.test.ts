import { describe, expect, it } from 'vitest';
import worker from './index';
import { liveCloudServes, liveCloudServesVehicles } from '../../../shared/liveCloud';

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
  const at = Math.floor(Date.now() / 1000);
  const minute = at - (at % 60);
  const day = (slug: string) => JSON.stringify({ agency: slug, date: new Date(minute * 1000).toISOString().slice(0, 10), counts: [[minute - 60, 1490], [minute, 1502]] });
  const countEnv = { LIVE_ARCHIVE: { get: async (key: string) => (key.startsWith('counts/ttc/') ? { text: async () => day('ttc') } : null) }, MCP_LIVE: {} } as never;
  it('serves the latest count for an agency Live shows', async () => {
    const res = await worker.fetch(new Request('https://x.test/live/network-count?agency=ttc'), countEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ agency: 'ttc', at: minute, vehicles: 1502 });
  });
  it('never serves Kingston or an agency the recorder does not record', async () => {
    for (const agency of ['kingston', 'stm', '']) {
      const res = await worker.fetch(new Request(`https://x.test/live/network-count?agency=${agency}`), env);
      expect(res.status, agency).toBe(404);
    }
  });
});
