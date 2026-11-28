import { describe, expect, it } from 'vitest';
import { liveReadKeys } from '../privateBucket';

// #1928: the private Live bucket's own read-only token wins; today's R2_RO_* token is the fallback while it is unset.
describe('liveReadKeys', () => {
  it('prefers the Live bucket token when both of its values are set', () => {
    expect(liveReadKeys({ R2_LIVE_READ_ACCESS_KEY_ID: 'live', R2_LIVE_READ_SECRET_ACCESS_KEY: 'ls', R2_RO_ACCESS_KEY_ID: 'ro', R2_RO_SECRET_ACCESS_KEY: 'rs' })).toEqual({ accessKeyId: 'live', secretAccessKey: 'ls' });
  });
  it('falls back to R2_RO_* when the Live token is unset or half set', () => {
    expect(liveReadKeys({ R2_RO_ACCESS_KEY_ID: 'ro', R2_RO_SECRET_ACCESS_KEY: 'rs' })).toEqual({ accessKeyId: 'ro', secretAccessKey: 'rs' });
    expect(liveReadKeys({ R2_LIVE_READ_ACCESS_KEY_ID: 'live', R2_RO_ACCESS_KEY_ID: 'ro', R2_RO_SECRET_ACCESS_KEY: 'rs' })).toEqual({ accessKeyId: 'ro', secretAccessKey: 'rs' });
  });
});
