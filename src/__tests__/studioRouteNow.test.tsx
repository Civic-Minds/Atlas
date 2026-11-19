import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteNow from '../apps/studio/RouteNow';

const stretch = (from: string, to: string, minutes: number, minAgo?: number) => ({ fromStop: from, toStop: to, stops: 3, minutes, minAgo, scheduledGapMin: 6 });
const answer = { asOf: '8:26 PM', dataAgeMin: 0.7, directions: [{ direction: 'To Broadview', vehiclesNow: 14, standingNow: 2,
  bunchedNow: [stretch('A', 'B', 1.2, 3), stretch('C', 'D', 0.1, 1.7), stretch('E', 'F', 0.5, 2)], gappedNow: [] }],
  definitions: { bunched: 'Bunched means under 2 min.', gapped: 'Gapped means more than twice the scheduled gap.' } };

afterEach(() => vi.unstubAllGlobals());

describe('Studio right-now view (CIV-1893)', () => {
  it('shows the reading time and age, the closest bunched stretch first, the rest counted, and the definitions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: true, answer }) })));
    render(<RouteNow agency="ttc" route="504" />);
    expect(await screen.findByText(/Reading from 8:26 PM, 0\.7 min ago/)).toBeTruthy();
    expect(screen.getByText('C to D')).toBeTruthy();
    expect(screen.queryByText('A to B')).toBeNull();
    expect(screen.getByText('and 2 more')).toBeTruthy();
    expect(screen.getByText('No long gaps now')).toBeTruthy();
    expect(screen.getByText(/Bunched means under 2 min\./)).toBeTruthy();
  });

  it('shows nothing where there is no reader or no live figures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: false }) })));
    const { container } = render(<RouteNow agency="ttc" route="504" />);
    await new Promise(r => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
