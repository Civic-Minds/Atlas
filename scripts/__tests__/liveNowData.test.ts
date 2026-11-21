import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTokenEnv } from '../mcp/liveNowData';

describe("route_now's read-only token (CIV-1870)", () => {
  const file = join(mkdtempSync(join(tmpdir(), 'mcp-read-')), 'token.env');
  writeFileSync(file, '# comment\nATLAS_MCP_R2_READ_ACCOUNT_ID=acct\nexport ATLAS_MCP_R2_READ_KEY_ID="kid"\nATLAS_MCP_R2_READ_SECRET=sec\nR2_SECRET_ACCESS_KEY=write-key\n');

  it('takes the three read-only values from the credentials file, and nothing else from it', () => {
    const e = readTokenEnv({}, file);
    expect([e.ATLAS_MCP_R2_READ_ACCOUNT_ID, e.ATLAS_MCP_R2_READ_KEY_ID, e.ATLAS_MCP_R2_READ_SECRET]).toEqual(['acct', 'kid', 'sec']);
    expect(e.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });
  it('keeps values already in the environment, and does without a file', () => {
    const set = { ATLAS_MCP_R2_READ_ACCOUNT_ID: 'a', ATLAS_MCP_R2_READ_KEY_ID: 'b', ATLAS_MCP_R2_READ_SECRET: 'c' };
    expect(readTokenEnv(set, file)).toEqual(set);
    expect(readTokenEnv({}, join(tmpdir(), 'no-such-file.env'))).toEqual({});
  });
});

describe('Live time zones (#1612)', () => {
  it('gives every agency Live records a time zone, so route_now can read its clock', async () => {
    const { LIVE_ARCHIVE_SLUGS } = await import('../../shared/liveCoverage');
    const { LIVE_AGENCY_TIMEZONES } = await import('../../shared/livePollingConfig');
    expect(LIVE_ARCHIVE_SLUGS.filter(s => !LIVE_AGENCY_TIMEZONES[s])).toEqual([]);
  });
});

describe('route_now for an agency whose recording is paused (#1621)', () => {
  it('says recording is paused instead of reporting a quiet half hour', async () => {
    const { RECORDING_SLUGS } = await import('../../shared/liveArchiveFeeds');
    const { LIVE_ARCHIVE_SLUGS } = await import('../../shared/liveCoverage');
    const paused = LIVE_ARCHIVE_SLUGS.find(s => !RECORDING_SLUGS.includes(s));
    if (!paused) return; // every archive agency is recording: nothing to check
    const data = await import('../mcp/atlasData');
    const { memoryStore } = await import('../../shared/mcpMemoryStore');
    data.useStore(memoryStore({ catalog: [{ slug: paused, name: 'Paused Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, files: {} }));
    const { liveNowHandlers } = await import('../mcp/liveNowTools');
    const res = await liveNowHandlers.route_now({ agency: 'Paused Transit', route: '1' }) as { live: null; note: string };
    expect(res.live).toBeNull();
    expect(res.note).toMatch(/paused/);
  });
});
