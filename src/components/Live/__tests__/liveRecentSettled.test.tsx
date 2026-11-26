import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// #1833: Studio Live's "Right now" said "These figures can't be shown right now" on TTC 504 before its data came in. The
// recorded half hour is still on its way then; the section reads the existing "Loading…" until it has come back or failed.
let resolveFetch: ((r: Response) => void) | null = null;
vi.mock('../../../lib/liveCloudFetch', () => ({ liveCloudFetch: () => new Promise<Response>(r => { resolveFetch = r; }) }));

describe('useRecentPositions (#1833)', () => {
  it('is unsettled until the recorded half hour comes back, then settled', async () => {
    const { useRecentPositions } = await import('../LiveRoutePerformance');
    resolveFetch = null;
    const { result } = renderHook(() => useRecentPositions([], 'ttc', '504'));
    expect(result.current.seedSettled).toBe(false);
    await waitFor(() => expect(resolveFetch).not.toBeNull());
    await act(async () => { resolveFetch!(new Response(JSON.stringify({ snapshots: [] }), { status: 200 })); });
    await waitFor(() => expect(result.current.seedSettled).toBe(true));
  });

  it('settles when the request fails too, so a real failure still says so', async () => {
    const { useRecentPositions } = await import('../LiveRoutePerformance');
    resolveFetch = null;
    const { result } = renderHook(() => useRecentPositions([], 'ttc', '504'));
    await waitFor(() => expect(resolveFetch).not.toBeNull());
    expect(result.current.seedSettled).toBe(false);
    await act(async () => { resolveFetch!(new Response('', { status: 500 })); });
    await waitFor(() => expect(result.current.seedSettled).toBe(true));
  });
});
