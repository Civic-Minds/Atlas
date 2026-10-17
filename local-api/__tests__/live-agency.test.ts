import { mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import liveAgency from '../live-agency.js';

const get = async () => { const res = await liveAgency.fetch(new Request('http://localhost/api/live-agency?agency=ttc')); return await res.json() as { status: string; reason?: string }; };
const at = (file: string, seconds: number) => utimesSync(file, seconds, seconds);

describe('live-agency API: a summary older than its route files is not served (CIV-305)', () => {
  afterEach(() => { delete process.env.LIVE_SEGMENTS_DIR; });

  it('serves a summary at least as new as every route file, and refuses one that a route re-run has outdated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-agency-'));
    process.env.LIVE_SEGMENTS_DIR = dir;
    const summary = join(dir, 'ttc-agency.json'), route = join(dir, 'ttc-501-segments.json');
    writeFileSync(summary, JSON.stringify({ schema: 1, agency: 'ttc', routes: [] }));
    writeFileSync(route, '{}');
    at(route, 1000); at(summary, 2000);
    expect((await get()).status).toBe('ready');
    at(route, 3000); // the route was re-run after the summary was built
    const stale = await get();
    expect(stale.status).toBe('no_analysis');
    expect(stale.reason).toMatch(/live-agency-summary/);
    at(summary, 4000); // rebuilt
    expect((await get()).status).toBe('ready');
  });
});
