import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_STOP_UNAVAILABLE } from '../../../../content/missingNoticesDraft';

vi.mock('../../../../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'live' ? true : (t as Record<string | symbol, unknown>)[k]) }) };
});
vi.mock('../../../../../shared/livePollingConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../shared/livePollingConfig')>();
  return { ...actual, isLiveEligibleSlug: () => true };
});

const { default: LiveStopArrivals } = await import('../LiveStopArrivals');

afterEach(() => vi.unstubAllGlobals());

// CIV-959 gap 13: a failed live-stop request says so instead of looking like a stop with no live data.
describe('LiveStopArrivals', () => {
  it('shows the unavailable line when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    render(<LiveStopArrivals slug="ttc" stopId="1" lat={43.6} lon={-79.4} />);
    expect(await screen.findByText(LIVE_STOP_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText('Live at this stop')).toBeInTheDocument();
  });

  it('shows nothing when the stop simply has no live arrivals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ now: 0, arrivals: [], observedGapMin: null }) }));
    const { container } = render(<LiveStopArrivals slug="ttc" stopId="1" lat={43.6} lon={-79.4} />);
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
