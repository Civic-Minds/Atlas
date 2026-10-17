import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveDashboardCache, fetchLiveDashboard } from '../liveDashboardFetch';

describe('fetchLiveDashboard', () => {
  beforeEach(() => clearLiveDashboardCache());
  afterEach(() => vi.unstubAllGlobals());

  it('downloads a route once however many places ask for it', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ready', route: '510' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([fetchLiveDashboard('ttc', '510'), fetchLiveDashboard('ttc', '510')]);
    await fetchLiveDashboard('ttc', '510');
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchLiveDashboard('ttc', '504');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed download so the next ask retries', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ status: 'ready' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchLiveDashboard('ttc', '510')).rejects.toThrow('offline');
    await expect(fetchLiveDashboard('ttc', '510')).resolves.toEqual({ status: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
