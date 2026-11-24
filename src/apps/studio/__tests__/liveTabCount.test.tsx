import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveRouteCount, useLiveAgency } from '../../../LiveAgencyPage';

vi.mock('../../../hooks/useLiveAgencyName', () => ({ useLiveAgencyName: (slug: string) => slug, useLiveAgencyNames: (slug: string) => ({ name: slug, title: slug }) }));

const answer = (agency: string, covered: string[]) => ({ status: 'ready', summary: { agency, covered } });

// #1764: the route count beside Studio's Live tab. Studio reads the agency's Live answer itself, on every page, and the
// count belongs to the agency it was read for.
describe('the Live tab’s route count (#1764)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the agency’s count once read, and none for a new agency until its own answer arrives', async () => {
    const pending: Record<string, (r: Response) => void> = {};
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(done => { pending[new URL(url, 'http://x').searchParams.get('agency') ?? url] = done; })));
    const { result, rerender } = renderHook(({ slug }) => liveRouteCount(useLiveAgency(slug)), { initialProps: { slug: 'ttc' } });
    expect(result.current).toBeUndefined();
    await act(async () => pending.ttc(new Response(JSON.stringify(answer('ttc', ['501', '504', '505'])))));
    await waitFor(() => expect(result.current).toBe(3));

    // Switching agency: TTC's 3 is never shown as Hamilton's.
    rerender({ slug: 'hamilton' });
    expect(result.current).toBeUndefined();
    await act(async () => pending.hamilton(new Response(JSON.stringify(answer('hamilton', ['1', '10'])))));
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('has no count while closed (no agency asked) or when Live has no figures for the agency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'no_data', reason: 'x' }))));
    const closed = renderHook(() => liveRouteCount(useLiveAgency('')));
    expect(closed.result.current).toBeUndefined();
    const none = renderHook(() => useLiveAgency('kingston'));
    await waitFor(() => expect(none.result.current.kind).toBe('done'));
    expect(liveRouteCount(none.result.current)).toBeUndefined();
  });
});
