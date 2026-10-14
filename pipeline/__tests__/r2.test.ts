import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getR2Client, IMMUTABLE_CACHE_CONTROL, isRetryableR2Error, r2ObjectHeaders, r2PutFile } from '../r2.js';

function connectAggregateError(codes: string[]): AggregateError {
  const children = codes.map(code => Object.assign(new Error(`connect ${code}`), { code }));
  const err = new AggregateError(children, '');
  return Object.assign(err, { code: codes[0], name: 'TimeoutError' });
}

describe('isRetryableR2Error', () => {
  it('retries plain errors matched by message', () => {
    expect(isRetryableR2Error(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableR2Error(new Error('socket hang up'))).toBe(true);
    expect(isRetryableR2Error(Object.assign(new Error('connect EADDRNOTAVAIL'), { code: 'EADDRNOTAVAIL' }))).toBe(true);
    expect(isRetryableR2Error(new Error('NoSuchKey'))).toBe(false);
  });

  it('retries an AggregateError with an empty message but a retryable code/name', () => {
    // Shape produced by Node's internalConnectMultiple on dual-stack timeout —
    // .message is '' and the signal lives on .code/.name instead (2026-07-20, 2026-07-27 outages).
    const err = connectAggregateError(['ETIMEDOUT']);
    expect(err.message).toBe('');
    expect(isRetryableR2Error(err)).toBe(true);
  });

  it('retries when only the IPv6 branch reports ENETUNREACH', () => {
    const err = Object.assign(new AggregateError(
      [Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' })],
      ''
    ), { code: undefined, name: 'AggregateError' });
    expect(isRetryableR2Error(err)).toBe(true);
  });

  it('does not retry a genuine non-network error', () => {
    expect(isRetryableR2Error(new TypeError('Cannot read properties of undefined'))).toBe(false);
  });

  it('handles null/non-error input safely', () => {
    expect(isRetryableR2Error(null)).toBe(false);
    expect(isRetryableR2Error('random string')).toBe(false);
  });
});

describe('getR2Client', () => {
  it('reuses the configured client for repeated archive operations', () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'test-account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret-key');

    expect(getR2Client()).toBe(getR2Client());

    vi.unstubAllEnvs();
  });
});

describe('release object Cache-Control (#840)', () => {
  it('adds Cache-Control only when asked', () => {
    expect(r2ObjectHeaders('application/json')).toEqual({ ContentType: 'application/json' });
    expect(r2ObjectHeaders('application/octet-stream', { cacheControl: IMMUTABLE_CACHE_CONTROL }))
      .toEqual({ ContentType: 'application/octet-stream', CacheControl: 'public, max-age=31536000, immutable' });
  });

  it('r2PutFile sends the Cache-Control on the object it uploads', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'test-account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret-key');
    vi.stubEnv('R2_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('R2_PUBLIC_URL', 'https://data.example');
    const send = vi.spyOn(getR2Client(), 'send').mockResolvedValue({} as never);
    const dir = mkdtempSync(join(tmpdir(), 'atlas-r2-test-'));
    try {
      const file = join(dir, 'atlas.pmtiles');
      writeFileSync(file, 'tiles');
      await r2PutFile('atlas/releases/r1/atlas.pmtiles', file, 'application/octet-stream', { cacheControl: IMMUTABLE_CACHE_CONTROL });
      await r2PutFile('atlas/releases/r1/agencies/ttc.json', file, 'application/json');
      const inputs = send.mock.calls.map(([command]) => (command as { input: Record<string, unknown> }).input);
      expect(inputs[0]).toMatchObject({ Key: 'atlas/releases/r1/atlas.pmtiles', CacheControl: IMMUTABLE_CACHE_CONTROL });
      expect(inputs[1].CacheControl).toBeUndefined();
    } finally {
      send.mockRestore();
      rmSync(dir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });
});
