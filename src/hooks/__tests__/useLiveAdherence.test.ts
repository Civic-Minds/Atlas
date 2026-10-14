import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ live: false }));
vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'live' ? flags.live : (t as never)[k]) }) };
});

import { useLiveAdherence } from '../useLiveAdherence';

afterEach(() => { vi.unstubAllGlobals(); });

describe('useLiveAdherence (#848)', () => {
  it('makes no request while Live is off', () => {
    flags.live = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useLiveAdherence('ttc', '504'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requests adherence for the route when Live is on', () => {
    flags.live = true;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useLiveAdherence('ttc', '504'));
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/live-adherence?agency=ttc&route=504');
  });
});
