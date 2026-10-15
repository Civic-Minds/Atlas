import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import liveDashboard from '../live-dashboard.js';

const get = async (q: string) => { const res = await liveDashboard.fetch(new Request(`http://localhost/api/live-dashboard?${q}`)); return { status: res.status, body: await res.json() as Record<string, unknown> }; };

describe('live-dashboard API: always a status and a reason, never a bare 404 or empty body', () => {
  afterEach(() => { delete process.env.LIVE_SEGMENTS_DIR; });

  it('asks for an agency and a route', async () => {
    const r = await get('agency=ttc');
    expect(r.status).toBe(400);
    expect(r.body.status).toBe('unknown_route');
    expect(String(r.body.reason)).toMatch(/route/);
  });
  it('says an unknown route is unknown, without reading any file', async () => {
    expect((await get('agency=ttc&route=../../etc/passwd')).body.status).toBe('unknown_route');
    expect((await get('agency=nowhere&route=1')).body.status).toBe('unknown_route');
  });
  it('holds the 512 with the reason', async () => {
    const r = await get('agency=ttc&route=512');
    expect(r.body.status).toBe('held');
    expect(String(r.body.reason)).toMatch(/512/);
  });
  it('says how to build a missing analysis, and that an old one needs a rebuild', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-dash-'));
    process.env.LIVE_SEGMENTS_DIR = dir;
    const missing = await get('agency=ttc&route=505');
    expect(missing.body.status).toBe('no_analysis');
    expect(String(missing.body.reason)).toMatch(/npm run live:analyze -- 505/);
    writeFileSync(join(dir, 'ttc-505-segments.json'), JSON.stringify({ generatedAt: 'x', segments: [] }));
    const old = await get('agency=ttc&route=505');
    expect(old.body.status).toBe('no_analysis');
    expect(String(old.body.reason)).toMatch(/older version/);
  });
  it('serves the v3 block when it exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-dash-'));
    process.env.LIVE_SEGMENTS_DIR = dir;
    writeFileSync(join(dir, 'ttc-510-segments.json'), JSON.stringify({ generatedAt: '2026-10-15T00:00:00Z', v3: { schema: 3, window: { days: 7, dates: [] } } }));
    const r = await get('agency=ttc&route=510');
    expect(r.body).toMatchObject({ status: 'ready', route: '510', replacementBuses: false });
    expect(String(r.body.note)).toMatch(/about \+2 to \+3 min/);
  });
});
