// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StopCard } from '../StopCard';

// CIV-1052 (#1169): a stop whose own routes are all idle in the chosen time says so (N35) instead of
// showing only Nearby routes. MiWay stop 0814 at midday: 314 and 315 serve it but don't run then.
describe('stop card with none of its routes in the chosen time', () => {
  it('shows N35 above Nearby routes', () => {
    const text = render(
      <StopCard
        currentStop={{ stopName: 'Dream Crest Rd At Rick Hansen Secondary School' }}
        setSelectedStop={vi.fn()} setSelectedRoute={vi.fn()}
        stopAgencies={['MiWay']} stopAgencyFilter={null} setStopAgencyFilter={vi.fn()}
        filteredStopRoutes={[]}
        period="midday"
        nearbyConnections={[{ rKey: 'miway::10', routeShortName: '10', label: { text: '10', primary: '10', secondary: 'Bristol' } as never, routeLongName: 'Bristol', agencyName: 'MiWay', headway: 25, nearestStopName: 'Bristol Rd At Lismic Blvd', distanceMeters: 489 }]}
      />,
    ).container.textContent?.replace(/⁠/g, '').replace(/ /g, ' ') ?? '';
    expect(text).toContain('No routes stop here from 9 AM–3 PM.');
    expect(text.indexOf('No routes stop here')).toBeLessThan(text.indexOf('Nearby routes'));
  });

  it('says nothing extra when the whole day is chosen', () => {
    const text = render(
      <StopCard
        currentStop={{ stopName: 'Dream Crest Rd At Rick Hansen Secondary School' }}
        setSelectedStop={vi.fn()} setSelectedRoute={vi.fn()}
        stopAgencies={['MiWay']} stopAgencyFilter={null} setStopAgencyFilter={vi.fn()}
        filteredStopRoutes={[]} period="all" nearbyConnections={[]}
      />,
    ).container.textContent ?? '';
    expect(text).not.toContain('No routes stop here');
  });
});
