import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let viewport: { bounds: { n: number; s: number; e: number; w: number } | null; zoom: number | null } = { bounds: null, zoom: null };
vi.mock('../../context/ViewportContext', () => ({ useViewport: () => viewport }));
vi.mock('../../lib/maplibreWorker', () => ({}));
import NightService from '../NightService';

const bounds = { n: 44, s: 43, e: -79, w: -80 };
const renderNight = (query = '') =>
  render(<NightService active layers={{}} frequency={60} query={query} onBackToMap={() => {}} />);

describe('Night list when the map has no routes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ criteria: '', agencyCount: 0, routeCount: 0, routes: [] }) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says it is zoomed out, not that no routes run (CIV-1337)', async () => {
    viewport = { bounds, zoom: 6 };
    renderNight();
    expect(await screen.findByText('Zoomed out. Some less frequent routes are hidden')).toBeInTheDocument();
    expect(screen.queryByText(/No routes here run/)).not.toBeInTheDocument();
  });

  it('keeps "No routes here run" when zoomed in', async () => {
    viewport = { bounds, zoom: 12 };
    renderNight();
    await waitFor(() => expect(screen.getByText(/No routes here run every 60 min or better/)).toBeInTheDocument());
    expect(screen.queryByText(/Zoomed out/)).not.toBeInTheDocument();
  });
});
