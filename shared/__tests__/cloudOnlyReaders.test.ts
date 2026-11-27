/**
 * CIV-2914 (#1804; Ryan, 2026-11-24: "MAKE THE LIVE PAGE READ THE CLOUD DATA"): Live and the MCP read the cloud, never
 * files on this Mac. This guard fails when an app, Live or MCP reader picks up a Mac path (tmp/, _live-data, the local
 * API at localhost:5001 or /api/live-*) or a filesystem import. The only exceptions are listed below, each with its
 * reason: opt-in test folders behind an environment variable, the read-only key and credentials files, the committed
 * agency registry, and code that runs in the cloud jobs. It also checks that the private-bucket readers throw without
 * keys, instead of answering "nothing built".
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

const READERS = /^(src|shared|local-api|scripts\/mcp|workers\/atlas-live-read\/src|workers\/atlas-mcp\/src)\/.+\.(ts|tsx)$/;
const NOT_READERS = /(__tests__|\.test\.|\.d\.ts$)/;

/** Mac paths and the local API: never in a reader. */
const MAC_PATH = /['"`/]tmp\/|_live-data|localhost:5001|['"`]\/api\/live-/;
const MAC_PATH_ALLOWED: Record<string, string> = {
  'src/lib/liveCloudFetch.ts': 'dev builds only: an agency the cloud reader refuses (Studio\'s private demo) is asked of the local API',
  'shared/liveStudioAgencies.ts': 'Studio\'s agency menu, a dev-only page; its endpoint reads the cloud (liveFiles)',
  'local-api/live-dashboard.ts': 'a developer hint naming the analysis command, not a read',
  'scripts/mcp/diskStore.ts': 'used only behind ATLAS_MCP_DATA_DIR (an opt-in test folder) and by the cloud rebuild\'s split builder',
  'scripts/mcp/releaseMcpFiles.ts': 'runs in the cloud rebuild (its work folder)',
  'scripts/mcp/weeklyReview.ts': 'a developer report, not a reader',
};

/** Filesystem imports: only these, each reading an opt-in folder, a key file or the committed registry. */
const FS_IMPORT = /from ['"](node:)?fs(\/promises)?['"]/;
const FS_ALLOWED: Record<string, string> = {
  'local-api/liveFiles.ts': 'LIVE_SEGMENTS_DIR, an opt-in test folder',
  'local-api/studioFiles.ts': 'STUDIO_DIR, an opt-in test folder',
  'local-api/mcp-coverage.ts': 'the read-only keys from the main checkout\'s .env.local',
  'local-api/liveFeedKeys.ts': 'the Live feed keys from the main checkout\'s .env.local',
  'local-api/analytics.ts': 'the read-only Analytics credentials file',
  'local-api/mcp-testers.ts': 'the MCP admin credentials file',
  'local-api/agencyName.ts': 'the committed agency registry (config/agencies)',
  'local-api/live-studio-agencies.ts': 'the committed agency registry (config/agencies)',
  'scripts/mcp/liveNowData.ts': 'ATLAS_MCP_NOW_DIR, an opt-in test folder, and the read-only credentials file',
  'scripts/mcp/folderReader.ts': 'ATLAS_MCP_STORE=split:<folder> and ATLAS_MCP_LIVE_DIR, opt-in test folders',
  'scripts/mcp/diskStore.ts': 'ATLAS_MCP_DATA_DIR, an opt-in test folder',
  'scripts/mcp/localData.ts': 'ATLAS_MCP_FEEDS_DIR, an opt-in test folder',
  'scripts/mcp/releaseLivePrivate.ts': 'runs in the cloud job (studio-live-refresh / mcp-live)',
  'scripts/mcp/releaseMcpFiles.ts': 'runs in the cloud rebuild',
  'scripts/mcp/splitRelease.ts': 'runs in the cloud rebuild',
  'scripts/mcp/weeklyReview.ts': 'a developer report, not a reader',
  'src/data/onDemandServiceAreas.ts': 'the on-demand registry\'s pipeline export, never imported by the app',
  'src/data/onDemandExport.ts': 'the on-demand registry\'s pipeline export, never imported by the app',
  'src/data/onDemandSources.ts': 'the on-demand registry\'s pipeline export, never imported by the app',
};

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(f => READERS.test(f) && !NOT_READERS.test(f));

describe('Live and MCP readers read the cloud, never this Mac (CIV-2914)', () => {
  it('no reader names a Mac path or the local Live API', () => {
    const found = files.filter(f => !(f in MAC_PATH_ALLOWED) && MAC_PATH.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('no reader imports the filesystem, except the listed opt-in folders and key files', () => {
    const found = files.filter(f => !(f in FS_ALLOWED) && FS_IMPORT.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('the exceptions still exist, so the list cannot go stale', () => {
    expect([...Object.keys(MAC_PATH_ALLOWED), ...Object.keys(FS_ALLOWED)].filter(f => !files.includes(f))).toEqual([]);
  });

  it('liveFiles() and studioFiles() throw without the read-only keys, rather than answer "nothing built"', async () => {
    vi.resetModules();
    vi.doMock('../../local-api/mcp-coverage.js', () => ({ mainCheckoutEnv: () => ({}), mainCheckoutRoot: () => null }));
    const saved = { live: process.env.LIVE_SEGMENTS_DIR, studio: process.env.STUDIO_DIR };
    delete process.env.LIVE_SEGMENTS_DIR;
    delete process.env.STUDIO_DIR;
    try {
      const { liveFiles } = await import('../../local-api/liveFiles');
      const { studioFiles } = await import('../../local-api/studioFiles');
      expect(() => liveFiles()).toThrow(/read-only keys/);
      expect(() => studioFiles()).toThrow(/read-only keys/);
    } finally {
      if (saved.live !== undefined) process.env.LIVE_SEGMENTS_DIR = saved.live;
      if (saved.studio !== undefined) process.env.STUDIO_DIR = saved.studio;
      vi.doUnmock('../../local-api/mcp-coverage.js');
      vi.resetModules();
    }
  });
});
