import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepSlugs, useLiveFeeds } from '../useLiveFeeds';

// #1568: the "can't be shown" notice named York Region Transit after the map had moved away from it,
// because an agency's error outlived its leaving the view.
const fail = () => Promise.resolve(new Response(JSON.stringify({ error: 'down' }), { status: 502 }));
const ok = () => Promise.resolve(new Response(JSON.stringify({ vehicles: [], headways: {} }), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe('useLiveFeeds keeps only agencies in view (#1568)', () => {
  it('drops an agency\'s error once it leaves the view', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.includes('yrt') ? fail() : ok())));
    const { result, rerender } = renderHook(({ slugs }) => useLiveFeeds(true, slugs, slugs.join(',')), { initialProps: { slugs: ['yrt'] } });
    await waitFor(() => expect(result.current.errorBySlug.yrt).toBe('down'));
    rerender({ slugs: ['ttc'] });
    await waitFor(() => expect(result.current.loadingBySlug.ttc).toBe(false));
    expect(result.current.errorBySlug).not.toHaveProperty('yrt');
    expect(result.current.failCountBySlug).not.toHaveProperty('yrt');
  });

  it('ignores a reply that arrives after its agency left the view', async () => {
    let reject!: () => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.includes('yrt')
      ? new Promise<Response>(resolve => { reject = () => resolve(new Response('{}', { status: 502 })); })
      : ok())));
    const { result, rerender } = renderHook(({ slugs }) => useLiveFeeds(true, slugs, slugs.join(',')), { initialProps: { slugs: ['yrt'] } });
    rerender({ slugs: ['ttc'] });
    await act(async () => { reject(); });
    await waitFor(() => expect(result.current.loadingBySlug.ttc).toBe(false));
    expect(result.current.errorBySlug).not.toHaveProperty('yrt');
  });

  it('keeps the same record when no agency leaves', () => {
    const prev = { a: 1, b: 2 };
    expect(keepSlugs(prev, new Set(['a', 'b', 'c']))).toBe(prev);
    expect(keepSlugs(prev, new Set(['a']))).toEqual({ a: 1 });
  });
});
