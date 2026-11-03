import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StopRouteGroup from '../panels/StopRouteGroup';
import type { StopBranch } from '../panels/StopCard';
import { routeLabels } from '../../../utils/format';
import { keyboardFocusHover } from '../RouteDirectionRow';

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
      branches={[branch('Buckner', 1, 20), branch('North Carrollton', 0, 20), branch('Bachman', 0, 40)]}
      period="midday"
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
        shortName="504" label={routeLabels({ shortName: '504', longName: 'King' })} longName="King"
        branches={[pooled('Broadview', 0, 10), pooled('Distillery', 0, 10)]}
        period="midday" onOpenRoute={() => {}}
      />,
    );
    // Never "to Broadview every 5 min": that destination comes every 10.
    expect(screen.getAllByText('every 10 min')).toHaveLength(2);
    expect(screen.getAllByText('every 5 min')).toHaveLength(1);
  });

  it('the combined value is the route card\'s "Shared stretch" row, above its direction\'s rows (CIV-1078, LA Metro 40 at 9059)', () => {
    const at = (headsign: string, directionId: number, own: number, pooled: number) => ({ ...branch(headsign, directionId, pooled), rowHeadway: own });
    render(
      <StopRouteGroup
        shortName="40" label={routeLabels({ shortName: '40', longName: 'Hawthorne Bl' })} longName="Hawthorne Bl"
        branches={[at('Division 13', 0, 23, 10), at('Patsaouras', 0, 18, 10), at('South Bay Galleria', 1, 12, 12)]}
        period="midday" onOpenRoute={() => {}}
      />,
    );
    const text = document.body.textContent ?? '';
    // The route line carries no value of its own; the shared row comes after it and before the branch rows.
    expect(text.indexOf('Shared stretch')).toBeGreaterThan(text.indexOf('Hawthorne'));
    expect(text.indexOf('Shared stretch')).toBeLessThan(text.indexOf('Division 13'));
    expect(screen.getAllByText('Shared stretch')).toHaveLength(1);
    expect(screen.getAllByText('every 10 min')).toHaveLength(1);
    expect(screen.getByText('every 23 min')).toBeInTheDocument();
    expect(screen.getByText('every 18 min')).toBeInTheDocument();
    // The other direction has one destination: no shared row there.
    expect(text.indexOf('Shared stretch')).toBeLessThan(text.indexOf('South Bay'));
  });

  it('a direction with one destination has no shared row, even where the stop sees more buses (TTC 29 at Wilson, northbound)', () => {
    render(
      <StopRouteGroup
        shortName="29" label={routeLabels({ shortName: '29', longName: 'Dufferin' })} longName="Dufferin"
        branches={[{ ...branch('Wilson', 1, 8), rowHeadway: 16 }]}
        period="midday" onOpenRoute={() => {}}
      />,
    );
    expect(screen.queryByText('Shared stretch')).toBeNull();
    expect(screen.getByText('every 16 min')).toBeInTheDocument();
  });

  it("a branch value better than the stop's is not used: the row never claims more service than the stop sees", () => {
    render(
      <StopRouteGroup
        shortName="503" label={routeLabels({ shortName: '503', longName: 'Kingston Rd' })} longName="Kingston Rd"
        branches={[{ ...branch('Victoria Park', 0, 10), rowHeadway: 6 }]}
        period="midday" onOpenRoute={() => {}}
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

  it('hovering the route line names the whole route for the map (CIV-1053)', () => {
    const setHoveredBranch = renderGroup();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Green Line/ }));
    expect(setHoveredBranch).toHaveBeenCalledWith({ routeKey: 'dart::green' });
  });

  it("with the route line hovered, the route's own rows stay; another route's line fades (CIV-1053)", () => {
    const { container, rerender } = render(
      <StopRouteGroup
        shortName="GREEN" label={routeLabels({ shortName: 'GREEN', longName: 'Green Line' })} longName="Green Line"
        branches={[branch('Buckner', 1, 20)]} period="midday" onOpenRoute={() => {}}
        hoveredBranch={{ routeKey: 'dart::green' }} setHoveredBranch={() => {}}
      />,
    );
    expect(container.querySelector('.opacity-35')).toBeNull();
    rerender(
      <StopRouteGroup
        shortName="GREEN" label={routeLabels({ shortName: 'GREEN', longName: 'Green Line' })} longName="Green Line"
        branches={[branch('Buckner', 1, 20)]} period="midday" onOpenRoute={() => {}}
        hoveredBranch={{ routeKey: 'dart::red' }} setHoveredBranch={() => {}}
      />,
    );
    expect(container.querySelectorAll('.opacity-35')).toHaveLength(2);
  });
});

describe('keyboardFocusHover (CIV-1053)', () => {
  const focusEvent = (keyboard: boolean) => ({ currentTarget: { matches: () => keyboard } }) as unknown as React.FocusEvent<HTMLElement>;

  it('keyboard focus starts the hover and blur ends it', () => {
    const start = vi.fn();
    const end = vi.fn();
    const handlers = keyboardFocusHover(start, end);
    handlers.onFocus!(focusEvent(true));
    expect(start).toHaveBeenCalledTimes(1);
    handlers.onBlur!();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('focus from a tap or click does not start it', () => {
    const start = vi.fn();
    keyboardFocusHover(start, vi.fn()).onFocus!(focusEvent(false));
    expect(start).not.toHaveBeenCalled();
  });

  it('a row with no hover gets no handlers', () => {
    expect(keyboardFocusHover(undefined, undefined)).toEqual({});
  });

  it('CIV-1251 row 8: the Shared stretch row reads the shared stretch\'s own time where it starts late', () => {
    const edge = { text: 'every 15 min from 8:07 AM', every: 15 };
    const timed = (headsign: string, text?: string) => ({ ...branch(headsign, 0, 30), rowHeadway: null, sharedEdge: edge, ...(text ? { periodText: text } : {}) });
    render(
      <StopRouteGroup
        shortName="110" label={routeLabels({ shortName: '110', longName: 'Islington South' })} longName="Islington South"
        branches={[timed('Kipling and Lake Shore', 'every 30 min from 7:29 AM')]}
        period="amPeak" onOpenRoute={() => {}}
      />,
    );
    const text = document.body.textContent?.replace(/[\u00a0\u202f\u2060]/g, ' ') ?? '';
    expect(text).toContain('Shared stretchevery 15 min from 8:07 AM');
  });
});

