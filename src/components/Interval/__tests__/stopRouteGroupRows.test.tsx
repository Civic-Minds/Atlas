import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StopRouteGroup from '../panels/StopRouteGroup';
import type { StopBranch } from '../panels/StopCard';
import { routeLabels } from '../../../utils/format';

// CIV-918: every destination is a route card row with its own frequency, ordered by direction, no
// direction lines, and hovering one shows that route and direction on the map.
const branch = (headsign: string, directionId: number, minutes: number): StopBranch => ({
  rKey: 'dart::green',
  headsign,
  directionId,
  service: { byPeriod: { midday: minutes } } as unknown as StopBranch['service'],
  rowHeadway: minutes,
});

function renderGroup(setHoveredBranch = vi.fn()) {
  render(
    <StopRouteGroup
      shortName="GREEN"
      label={routeLabels({ shortName: 'GREEN', longName: 'Green Line' })}
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
  it("rows show each pattern's own value; the route line keeps the pooled value where it is better", () => {
    const pooled = (headsign: string, directionId: number, own: number) => ({ ...branch(headsign, directionId, 5), rowHeadway: own });
    render(
      <StopRouteGroup
        shortName="504" label={routeLabels({ shortName: '504', longName: 'King' })} longName="King" agencyName="TTC" agencySlug="ttc"
        branches={[pooled('Broadview', 0, 10), pooled('Distillery', 0, 10)]}
        period="midday" showAgency={false} onOpenRoute={() => {}}
      />,
    );
    // Never "to Broadview every 5 min": that destination comes every 10.
    expect(screen.getAllByText('every 10 min')).toHaveLength(2);
    expect(screen.getAllByText('every 5 min')).toHaveLength(1);
  });

  it("a branch value better than the stop's is not used: the row never claims more service than the stop sees", () => {
    render(
      <StopRouteGroup
        shortName="503" label={routeLabels({ shortName: '503', longName: 'Kingston Rd' })} longName="Kingston Rd" agencyName="TTC" agencySlug="ttc"
        branches={[{ ...branch('Victoria Park', 0, 10), rowHeadway: 6 }]}
        period="midday" showAgency={false} onOpenRoute={() => {}}
      />,
    );
    expect(screen.getByText('every 10 min')).toBeInTheDocument();
    expect(screen.queryByText('every 6 min')).toBeNull();
  });

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
