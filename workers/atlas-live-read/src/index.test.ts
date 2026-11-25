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
    for (const path of ['/live/vehicles?agency=kingston', '/live/segments?agency=kingston&route=701', '/live/dashboard?agency=kingston&route=701', '/live/recent?agency=kingston&route=701', '/live/agency?agency=kingston', '/live/gaps?agency=kingston&route=701']) {
      const res = await worker.fetch(new Request(`https://x.test${path}`), env);
      expect(res.status, path).toBe(404);
    }
  });
  it('serves the agencies Live shows', () => {
    expect(liveCloudServesVehicles('ttc')).toBe(true);
    expect(liveCloudServes('hamilton')).toBe(true);
  });
});
