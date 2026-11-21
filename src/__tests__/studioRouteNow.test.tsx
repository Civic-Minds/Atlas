import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteNow from '../apps/studio/RouteNow';

const stretch = (from: string, to: string, minutes: number, minAgo?: number) => ({ fromStop: from, toStop: to, stops: 3, minutes, minAgo, scheduledGapMin: 6 });
const answer = { asOf: '8:26 PM', dataAgeMin: 0.7, directions: [
  { direction: 'To Broadview', vehiclesNow: 14, standingNow: 2, bunchedNow: [stretch('A St', 'B St', 1.2, 3), stretch('C St', 'D St', 0.5, 1.7)], gappedNow: [] },
  { direction: 'To Dundas West', vehiclesNow: 5, standingNow: 0, bunchedNow: [], gappedNow: [stretch('E St', 'F St', 20)] },
] };

afterEach(() => vi.unstubAllGlobals());

describe('Studio right-now view (CIV-1893, CIV-2021)', () => {
  it('is two sections, service now and gaps now, a row per direction, then the closest pair and the longest wait', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: true, answer }) })));
    render(<RouteNow agency="ttc" route="504" />);
    expect(await screen.findByText(/Reading from 8:26 PM, 0\.7 min ago/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Service now' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Gaps and bunching now' })).toBeTruthy();
    expect(screen.getAllByText('To Broadview')).toHaveLength(2);
    expect(screen.getByText('16 vehicles')).toBeTruthy();
    expect(screen.getByText('2 bunched, 0 long gaps')).toBeTruthy();
    expect(screen.getByText('0 bunched, 1 long gap')).toBeTruthy();
    // No box inside the panel and no "Right now" heading (CIV-2021).
    expect(screen.queryByText('Right now')).toBeNull();
    expect(screen.getByText('Bunched between C St and D St: 0.5 min apart')).toBeTruthy();
    expect(screen.getByText('Long gap between E St and F St: 20 min wait, scheduled every 6 min')).toBeTruthy();
    expect(screen.queryByText(/A St/)).toBeNull();
  });

  it('says plainly when there is no live reading, instead of leaving the section out', async () => {
    for (const body of [{ available: false }, { available: true, answer: { live: null } }]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => body })));
      const { unmount } = render(<RouteNow agency="ttc" route="504" />);
      // Both sections stay, each saying so.
      expect(await screen.findAllByText('No live reading for this route right now.')).toHaveLength(2);
      expect(screen.getByRole('region', { name: 'Service now' })).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Gaps and bunching now' })).toBeTruthy();
      unmount();
    }
  });
});
