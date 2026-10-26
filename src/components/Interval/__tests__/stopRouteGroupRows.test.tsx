import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StopRouteGroup from '../panels/StopRouteGroup';
import type { StopBranch } from '../panels/StopCard';

// CIV-918: every destination is a route card row with its own frequency, ordered by direction, no
// direction lines, and hovering one shows that route and direction on the map.
const branch = (headsign: string, directionId: number, minutes: number): StopBranch => ({
  rKey: 'dart::green',
  headsign,
  directionId,
  service: { byPeriod: { midday: minutes } } as unknown as StopBranch['service'],
});

function renderGroup(setHoveredBranch = vi.fn()) {
  render(
    <StopRouteGroup
      shortName="GREEN"
      longName="Green Line"
      agencyName="DART"
      agencySlug="dart"
      branches={[branch('Buckner', 1, 20), branch('North Carrollton', 0, 20), branch('Bachman', 0, 40)]}
      period="midday"
      showAgency={false}
      onOpenRoute={() => {}}
      setHoveredBranch={setHoveredBranch}
    />,
  );
  return setHoveredBranch;
}

describe('StopRouteGroup rows (CIV-918)', () => {
  it('gives every destination its own frequency, even when they all match', () => {
    renderGroup();
    expect(screen.getAllByText('every 20 min')).toHaveLength(2);
    expect(screen.getByText('every 40 min')).toBeInTheDocument();
  });

  it('orders destinations by direction', () => {
    renderGroup();
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Carrollton')).toBeLessThan(text.indexOf('Buckner'));
    expect(text.indexOf('Bachman')).toBeLessThan(text.indexOf('Buckner'));
  });

  it('hovering a destination names its route and direction for the map', () => {
    const setHoveredBranch = renderGroup();
    fireEvent.mouseEnter(screen.getByText(/Buckner/));
    expect(setHoveredBranch).toHaveBeenCalledWith({ routeKey: 'dart::green', directionId: 1, headsign: 'Buckner' });
  });
});
