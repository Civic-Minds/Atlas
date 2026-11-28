import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkMcpRelease } from '../mcpRelease';
import { ACCEPTED_TILE_RULES_VERSIONS, ROUTE_ARTIFACT_SCHEMA_VERSION } from '../artifactSchema';

const ORIGIN = 'https://data.example';
const pointer = {
  releaseId: 'release-x',
  pmtilesKey: 'atlas/releases/release-x/atlas.pmtiles',
  overviewPmtilesKey: 'atlas/releases/release-x/atlas-overview.pmtiles',
  agencyPrefix: 'atlas/releases/release-x/agencies',
  routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  tileRulesVersion: ACCEPTED_TILE_RULES_VERSIONS[ACCEPTED_TILE_RULES_VERSIONS.length - 1],
};

function stub(body: unknown, manifestOk = true, pointerStatus = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/atlas/release.json')) return new Response(JSON.stringify(body), { status: pointerStatus });
    return new Response('{}', { status: manifestOk ? 200 : 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('checkMcpRelease (CIV-3019: the MCP refuses what the map refuses)', () => {
  it('is ready when the pointer is one this code reads and its MCP files are up', async () => {
    stub(pointer);
    expect(await checkMcpRelease(ORIGIN)).toEqual({ kind: 'ready', releaseId: 'release-x', base: `${ORIGIN}/atlas/releases/release-x/mcp` });
  });

  it('is not ready while the MCP files are missing', async () => {
    stub(pointer, false);
    expect(await checkMcpRelease(ORIGIN)).toEqual({ kind: 'notReady', releaseId: 'release-x' });
  });

  it('refuses a release built under another artifact schema, without reading its manifest', async () => {
    const fetchMock = stub({ ...pointer, routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION + 1 });
    expect(await checkMcpRelease(ORIGIN)).toEqual({ kind: 'incompatible', releaseId: 'release-x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a release built under tile rules this code does not accept', async () => {
    stub({ ...pointer, tileRulesVersion: -1 });
    expect((await checkMcpRelease(ORIGIN)).kind).toBe('incompatible');
  });

  it('still throws when the pointer cannot be read', async () => {
    stub({}, true, 500);
    await expect(checkMcpRelease(ORIGIN)).rejects.toThrow(/could not be read \(500\)/);
  });
});

describe('pointer recheck (CIV-2976 N3)', () => {
  it('the hosted Worker rechecks the pointer on the shared interval, not a typed copy', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('workers/atlas-mcp/src/index.ts', 'utf8');
    expect(source).toContain('POINTER_TTL_SECONDS = MCP_POINTER_RECHECK_MS / 1000');
    expect(source).not.toMatch(/POINTER_TTL_SECONDS = \d/);
  });
});
