import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteNow from '../apps/studio/RouteNow';

const stretch = (from: string, to: string, minutes: number, minAgo?: number) => ({ fromStop: from, toStop: to, stops: 3, minutes, minAgo, scheduledGapMin: 6 });
const answer = { asOf: '8:26 PM', dataAgeMin: 0.7, directions: [
  { direction: 'To Broadview', vehiclesNow: 14, standingNow: 2, bunchedNow: [stretch('A St', 'B St', 1.2, 3), stretch('C St', 'D St', 0.5, 1.7)], gappedNow: [] },
  { direction: 'To Dundas West', vehiclesNow: 5, standingNow: 0, bunchedNow: [], gappedNow: [stretch('E St', 'F St', 20)] },
] };

afterEach(() => vi.unstubAllGlobals());

describe('Studio right-now view (CIV-1893, CIV-1828)', () => {
  it('is a row per direction with its counts, then the closest pair and the longest wait as places between two stops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: true, answer }) })));
    render(<RouteNow agency="ttc" route="504" />);
    expect(await screen.findByText(/Reading from 8:26 PM, 0\.7 min ago/)).toBeTruthy();
    expect(screen.getByText('Direction')).toBeTruthy();
    expect(screen.getByText('To Broadview')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
    expect(screen.getByText('Bunched between C St and D St: 0.5 min apart')).toBeTruthy();
    expect(screen.getByText('Long gap between E St and F St: 20 min wait, scheduled every 6 min')).toBeTruthy();
    expect(screen.queryByText(/A St/)).toBeNull();
  });

  it('shows nothing where there is no reader or no live figures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: false }) })));
    const { container } = render(<RouteNow agency="ttc" route="504" />);
    await new Promise(r => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
