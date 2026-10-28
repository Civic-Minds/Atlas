import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NearbyRoutesPanel } from '../NearbyRoutesPanel';
import type { NearbyRoute } from '../../../hooks/useNearbyRoutes';

function route(over: Partial<NearbyRoute>): NearbyRoute {
  return {
    rKey: 'ttc::504',
    routeShortName: '504',
    displayShortName: '504',
    routeLongName: 'King',
    agencyName: 'TTC',
    agencySlug: 'ttc',
    headway: 8,
    limited: false,
    tier: null,
    nearestStopName: 'king st west at spadina ave',
    distanceMeters: 120,
    ...over,
  };
}

// CIV-900 M13: the Near You row shows its frequency with the shared badges, like the other route rows.
describe('Near You route rows', () => {
  it('shows the frequency, a shared range, and the no-regular words, each beside its dot', () => {
    render(
      <NearbyRoutesPanel
        setSelectedRoute={() => {}}
        routes={[
          route({ rKey: 'a', headway: 8 }),
          route({ rKey: 'b', headway: 12, sharedHeadway: 6 }),
          route({ rKey: 'c', headway: null, noRegular: true }),
        ]}
      />,
    );
    for (const text of ['every 8 min', 'every 6–12 min', 'no regular service']) {
      const badge = screen.getByText(text).closest('span.inline-flex') as HTMLElement;
      expect(badge.className).toContain('font-black');
      expect(badge.className).toContain('text-[var(--text-primary)]');
      expect(badge.querySelector('span.rounded-full.w-2.h-2')).toBeTruthy();
    }
  });

  // Critic review of CIV-900 M13: the wider badge squeezed "Yonge-University" to "Yonge-Univers…".
  it('lets a route name size to its text and wrap between words, never mid-word', () => {
    render(
      <NearbyRoutesPanel
        setSelectedRoute={() => {}}
        routes={[route({ rKey: 'ttc::1', displayShortName: '1', routeLongName: 'Yonge-University', headway: 12, sharedHeadway: 6 })]}
      />,
    );
    const name = screen.getByText('Yonge-University');
    expect(name.className).toContain('flex-auto');
    expect(name.className).not.toMatch(/break-words|break-all|min-w-/);
    expect(name.className).not.toMatch(/line-clamp|truncate/);
  });

  // TTC 301/305/306/320: no frequency and no words still show the grey dot, as before the shared badge.
  it('shows the grey dot alone for a route with no frequency and no label', () => {
    const { container } = render(
      <NearbyRoutesPanel
        setSelectedRoute={() => {}}
        routes={[route({ rKey: 'ttc::301', displayShortName: '301', routeLongName: 'Queen', headway: null, limited: false, noRegular: false })]}
      />,
    );
    const dot = container.querySelector('span.rounded-full.w-2.h-2') as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.style.background).toBe('rgb(107, 114, 128)');
    expect((dot.parentElement as HTMLElement).textContent).toBe('');
  });
});
