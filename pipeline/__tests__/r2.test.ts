import { describe, expect, it } from 'vitest';
import { isRetryableR2Error } from '../r2.js';

function connectAggregateError(codes: string[]): AggregateError {
  const children = codes.map(code => Object.assign(new Error(`connect ${code}`), { code }));
  const err = new AggregateError(children, '');
  return Object.assign(err, { code: codes[0], name: 'TimeoutError' });
}

describe('isRetryableR2Error', () => {
  it('retries plain errors matched by message', () => {
    expect(isRetryableR2Error(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableR2Error(new Error('socket hang up'))).toBe(true);
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
