import { describe, expect, it } from 'vitest';
import { isInternalTestSession } from '../internalTest';

describe('isInternalTestSession', () => {
  it('treats locally served builds as internal traffic', () => {
    // jsdom serves tests from localhost by default.
    expect(window.location.hostname).toBe('localhost');
    expect(isInternalTestSession()).toBe(true);
  });
});
