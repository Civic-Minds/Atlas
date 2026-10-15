import { describe, expect, it } from 'vitest';
import { ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../shared/artifactSchema';
import {
  ALLOW_UNPAIRED_UPLOAD_FLAG,
  publicAgenciesExcludedFromRelease,
  publicAgenciesMissingFromRelease,
  releaseFileExists,
  releasePublishError,
  tileRulesFingerprint,
  unpairedUploadError,
  type PublishEvidence,
  type ReleaseManifest,
} from '../releaseGuard';

const manifest: ReleaseManifest = {
  releaseId: 'release-b',
  generatedAt: '2026-10-10T12:00:00.000Z',
  routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
  tileRulesVersion: TILE_RULES_VERSION,
  codeVersion: 'abc123',
  pmtilesKey: 'atlas/releases/release-b/atlas.pmtiles',
  overviewPmtilesKey: 'atlas/releases/release-b/atlas-overview.pmtiles',
  agencyPrefix: 'atlas/releases/release-b/agencies',
};

function evidence(overrides: Partial<PublishEvidence> = {}): PublishEvidence {
  return {
    local: manifest,
    remote: { ...manifest },
    current: { releaseId: 'release-a', generatedAt: '2026-10-09T05:21:01.950Z' },
    pmtilesName: 'release-b',
    overviewPmtilesName: 'release-b',
    agencyStamps: { ttc: 'release-b', yrt: 'release-b' },
    codeVersion: 'abc123',
    ...overrides,
  };
}

describe('releasePublishError', () => {
  it('allows a release whose tiles and agency data were built together', () => {
    expect(releasePublishError(evidence())).toBeNull();
    expect(releasePublishError(evidence({ current: null }))).toBeNull();
  });

  it('refuses tiles that were not built with this release (stale or rebuilt separately)', () => {
    expect(releasePublishError(evidence({ pmtilesName: 'release-a' }))).toContain('not stamped');
    expect(releasePublishError(evidence({ overviewPmtilesName: undefined }))).toContain('not stamped');
  });

  it('refuses agency data that was not built with these tiles', () => {
    expect(releasePublishError(evidence({ agencyStamps: { ttc: 'release-b', yrt: undefined } }))).toContain('yrt=undefined');
    expect(releasePublishError(evidence({ agencyStamps: { ttc: 'missing' } }))).toContain('ttc=missing');
    expect(releasePublishError(evidence({ agencyStamps: {} }))).toContain('No agency snapshots');
  });

  it('refuses a half-finished upload or a leftover local manifest', () => {
    expect(releasePublishError(evidence({ remote: null }))).toContain('did not finish');
    expect(releasePublishError(evidence({ remote: { ...manifest, generatedAt: '2026-10-10T13:00:00.000Z' } }))).toContain('differs');
  });

  it('refuses tiles built under different tile rules or schema than this code', () => {
    expect(releasePublishError(evidence({ local: { ...manifest, tileRulesVersion: TILE_RULES_VERSION + 1 } }))).toContain('tile rules');
    expect(releasePublishError(evidence({ local: { ...manifest, tileRulesVersion: undefined } }))).toContain('tile rules');
    expect(releasePublishError(evidence({ local: { ...manifest, routeArtifactSchemaVersion: 1 } }))).toContain('route schema');
  });

  it('refuses publishing from different code than built the release', () => {
    expect(releasePublishError(evidence({ codeVersion: 'def456' }))).toContain('built from abc123');
  });

  it('refuses rolling back to an older or equal release', () => {
    expect(releasePublishError(evidence({ current: { releaseId: 'release-c', generatedAt: '2026-10-11T00:00:00.000Z' } }))).toContain('roll back');
    expect(releasePublishError(evidence({ current: { releaseId: 'release-b', generatedAt: manifest.generatedAt } }))).toContain('roll back');
  });

  it('refuses a manifest whose keys point outside its own release folder', () => {
    expect(releasePublishError(evidence({ local: { ...manifest, pmtilesKey: 'atlas.pmtiles' } }))).toContain('keys');
    expect(releasePublishError(evidence({ local: { ...manifest, releaseId: 'local-abc' } }))).toContain('releaseId');
  });
});

describe('unpairedUploadError', () => {
  it('blocks legacy root PMTiles uploads unless explicitly overridden', () => {
    expect(unpairedUploadError(['tmp/atlas.pmtiles'], 'upload-pmtiles')).toContain('outside a verified data release');
    expect(unpairedUploadError(['tmp/atlas.pmtiles', ALLOW_UNPAIRED_UPLOAD_FLAG], 'upload-pmtiles')).toBeNull();
  });
});

describe('tile rules fingerprint', () => {
  // These files decide what build-pmtiles bakes into the map tiles, and the app
  // re-applies them to agency JSON at load. If this hash changes:
  //  - if the change can alter any tile property (for example the
  //    worst-direction rule in #601), bump TILE_RULES_VERSION in
  //    shared/artifactSchema.ts. The deployed app then shows no route data
  //    until a release built with the new rules is published
  //    (npm run refresh-release, or the Refresh GTFS feeds workflow);
  //  - if it cannot (comments, types, refactors), just update the hash here.
  // #710 added pws_<period> (partial-weekday service) keys and the overview allowlist entry.
  // No version bump: older tiles lack pws and evaluate exactly as before, and older apps
  // ignore the new keys.
  // CIV-82 strips the new shared-stretch keys from tiles (JSON only). Tile properties are
  // unchanged, so the version stays and only the hash is recomputed. The CIV-82 phase 2 rule
  // text in worstDirection.ts / routeHeadwayFilter.ts is comment-only, and routeFilterHeadway
  // caching its per-period expression changes no value: hash only.
  // CIV-97 keeps only scalar and flat period keys in route tiles and drops the corridors layer.
  // No version bump: every value the client reads from a tile is unchanged, the dropped nested
  // tables were only ever read from agency JSON (never from tile features), and no code reads a
  // corridors tile layer. Older tiles still draw with this app, and tiles built under this change
  // draw with the previous app, so the switch needs no dual-version window.
  // #749 changes the all-day worst-direction headline (a tile property): version 3.
  // #840 only adds a Cache-Control header to the release archive uploads; no tile value changes: hash only.
  // #720 reclasses service (one-departure patterns drawn as one-off, rush-hour-only as limited), which
  // changes which routes the class filters show from the tiles: version 4, after the app accepted 4.
  // #899 adds the routeHasNoMiddayDirection key and an all-day filter clause that reads it. No
  // version bump, as for #710's pws keys: older tiles lack the key and evaluate exactly as before,
  // and older apps ignore it; the overview tiles keep it too. Hash only.
  it('changes only together with a deliberate TILE_RULES_VERSION decision', () => {
    expect({ version: TILE_RULES_VERSION, fingerprint: tileRulesFingerprint() }).toEqual({
      version: 4,
      fingerprint: 'c35de7fa186f0541e1c3374d23d2b28d973cfce91a5165489f089fe855ea08e6',
    });
  });
});

describe('public agencies without a release file (#759)', () => {
  const refreshed = { lastFeedExpiry: '20271231', lastRefreshedAt: '2026-10-12' };
  const agencies: Array<Record<string, unknown>> = [
    { slug: 'ttc', ...refreshed },
    { slug: 'yrt', ...refreshed },
    { slug: 'fort-bend', ...refreshed, pmtilesPending: true },
    { slug: 'mexico-city-metro' },
    { slug: 'siskiyou', ...refreshed, pmtilesPending: true, hiddenInProduction: true, issueUrl: 'https://github.com/Civic-Minds/Atlas/issues/492' },
    { slug: 'new-feed', ...refreshed, staged: true },
  ];

  it('fails a public agency with no file in the release', () => {
    const releaseFiles = new Set(['ttc']);
    expect(publicAgenciesMissingFromRelease(agencies, slug => releaseFiles.has(slug))).toEqual(['yrt', 'fort-bend', 'mexico-city-metro']);
  });

  it('passes hidden and staged agencies that have no file', () => {
    const releaseFiles = new Set(['ttc', 'yrt', 'fort-bend', 'mexico-city-metro']);
    expect(publicAgenciesMissingFromRelease(agencies, slug => releaseFiles.has(slug))).toEqual([]);
  });

  it('passes an agency that was not refreshed but still has its older file in the release', () => {
    const stale = [{ slug: 'ttc', lastFeedExpiry: '20250101', lastRefreshedAt: '2025-06-01' }];
    expect(publicAgenciesMissingFromRelease(stale, slug => slug === 'ttc')).toEqual([]);
  });

  it('flags public agencies build-pmtiles never copies into a release', () => {
    expect(publicAgenciesExcludedFromRelease(agencies)).toEqual(['fort-bend', 'mexico-city-metro']);
  });
});

describe('releaseFileExists', () => {
  const url = 'https://data.example/atlas/releases/release-b/agencies/ttc.json';
  const respond = (...statuses: Array<number | Error>) => {
    const calls: number[] = [];
    const fetchImpl = (async () => {
      const next = statuses[Math.min(calls.length, statuses.length - 1)];
      calls.push(calls.length);
      if (next instanceof Error) throw next;
      return new Response(null, { status: next, headers: next === 429 ? { 'retry-after': '2' } : {} });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  };
  const waits: number[] = [];
  const sleep = async (ms: number) => { waits.push(ms); };

  it('returns false on 404 and true on 200', async () => {
    expect(await releaseFileExists(url, { ...respond(404), sleep })).toBe(false);
    expect(await releaseFileExists(url, { ...respond(200), sleep })).toBe(true);
  });

  it('retries a 429, honouring Retry-After, then succeeds', async () => {
    waits.length = 0;
    const stub = respond(429, 200);
    expect(await releaseFileExists(url, { ...stub, sleep })).toBe(true);
    expect(stub.calls.length).toBe(2);
    expect(waits).toEqual([2000]);
  });

  it('retries a network error, then succeeds', async () => {
    expect(await releaseFileExists(url, { ...respond(new TypeError('fetch failed'), 200), sleep })).toBe(true);
  });

  it('throws after persistent 5xx', async () => {
    waits.length = 0;
    const stub = respond(503);
    await expect(releaseFileExists(url, { ...stub, sleep, retries: 4 })).rejects.toThrow(/after 5 attempts: HTTP 503/);
    expect(stub.calls.length).toBe(5);
    expect(waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it('throws at once on a non-retryable status', async () => {
    const stub = respond(403);
    await expect(releaseFileExists(url, { ...stub, sleep })).rejects.toThrow(/HTTP 403/);
    expect(stub.calls.length).toBe(1);
  });
});
