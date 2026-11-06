import { describe, expect, it } from 'vitest';
import { isInternalTestSession, isLocalHost } from '../internalTest';

describe('isInternalTestSession', () => {
  it('treats locally served builds as internal traffic', () => {
    // jsdom serves tests from localhost by default.
    expect(window.location.hostname).toBe('localhost');
    expect(isInternalTestSession()).toBe(true);
  });
});

describe('isLocalHost', () => {
  it('matches loopback, local-network and .local hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '127.0.1.1', '::1', '[::1]', 'app.localhost', 'macbook.local', '192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.255']) {
      expect(isLocalHost(host), host).toBe(true);
    }
  });

  it('does not match the live, beta or preview sites', () => {
    for (const host of ['transitatlas.fyi', 'www.transitatlas.fyi', 'beta.transitatlas.fyi', 'atlas-git-main-civic-minds.vercel.app', '172.32.0.1', '8.8.8.8', '']) {
      expect(isLocalHost(host), host).toBe(false);
    }
  });
});
