import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true, liveReports: true } };
});

import LiveAgencyPage from '../LiveAgencyPage';

const stretch = { route: '510', routeLabel: '510 Spadina', directionId: 1, direction: 'Northbound', fromStopId: 'a', toStopId: 'b', fromName: 'Queens Quay West', toName: 'King St West', n: 500 };
const summary = {
  schema: 1, agency: 'ttc', generatedAt: '2026-10-17T20:00:00Z', totalRoutes: 1, covered: ['510'], held: [], weekly: null, daily: { late: [], delivered: [], tripTime: [], extraWait: [], bunching: [] },
  routes: [], worstStops: [], delayStarts: [{ ...stretch, value: 2.4 }], bunchingForms: [{ ...stretch, value: 0.33 }],
};

describe('Live agency page', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ status: 'ready', summary }) })));
  });
  it('shows the rise in bunching for each stretch, like the delays table shows the minutes added', async () => {
    render(<MemoryRouter initialEntries={['/apps/live/ttc']}><Routes><Route path="/apps/live/:agency" element={<LiveAgencyPage />} /></Routes></MemoryRouter>);
    const bunching = within(await screen.findByRole('region', { name: 'Where bunching forms' }));
    expect(bunching.getByRole('columnheader', { name: /Added/ })).toBeTruthy();
    expect(bunching.getByText('33%')).toBeTruthy();
    const delays = within(screen.getByRole('region', { name: 'Where delays start' }));
    expect(delays.getByText('+2.4 min')).toBeTruthy();
  });
  it('keeps how this is measured open, with no disclosure to click', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/apps/live/ttc']}><Routes><Route path="/apps/live/:agency" element={<LiveAgencyPage />} /></Routes></MemoryRouter>);
    await screen.findByRole('region', { name: 'Where bunching forms' });
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('#agency-method')).toBeTruthy();
  });
});
