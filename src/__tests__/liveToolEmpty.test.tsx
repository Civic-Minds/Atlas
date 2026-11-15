import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, liveReports: true } };
});

// The map needs a browser with WebGL; this test is about the page around it.
vi.mock('../components/Live/RouteMap', () => ({ default: () => null }));

import LiveToolPage from '../LiveToolPage';

describe('Live map without figures (CIV-1413 C)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({ status: 'unknown_agency', reason: '' }) })));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the Atlas logo and the way back to the agency, not one bare line', async () => {
    render(<MemoryRouter initialEntries={['/apps/live/miway/tool']}><Routes><Route path="/apps/live/:agency/tool" element={<LiveToolPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/no route analysis for/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /← /, hidden: false }).getAttribute('href')).toBe('/apps/live/miway');
    expect(screen.getByLabelText('Atlas by Civic Minds')).toBeTruthy();
  });
});
