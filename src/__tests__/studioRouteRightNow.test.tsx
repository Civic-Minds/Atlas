import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const card = vi.fn((_props: Record<string, unknown>) => null);
vi.mock('../components/Live/LiveRoutePerformance', () => ({ default: (p: Record<string, unknown>) => card(p) }));
vi.mock('../hooks/useAgencies', () => ({ useAgencies: () => ({ agencies: [] }) }));
const v = (id: string, routeShortName: string) => ({ id, routeShortName, agencySlug: 'ttc' });
vi.mock('../hooks/useLiveFeeds', () => ({ useLiveFeeds: () => ({ vehiclesBySlug: { ttc: [v('a', '501'), v('b', '504'), v('c', '501')] }, degradedBySlug: {}, errorBySlug: {} }) }));
vi.mock('../lib/agencyGeo', () => ({ getCachedAgencyGeo: () => undefined, fetchAgencyGeo: () => new Promise(() => {}) }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import RouteRightNow, { unclaimedGroups } from '../apps/studio/RouteRightNow';
import { DIRECTION_UNCLEAR } from '../utils/liveGrouping';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';

describe("Studio's Live route panel shows main Live's right-now card (CIV-2021)", () => {
  it("hands the card the route's own live vehicles and every direction's rows (#1921)", () => {
    render(<RouteRightNow slug="ttc" routeShortName="501" direction={1} />);
    const props = card.mock.calls.at(-1)![0];
    expect((props.vehicles as { id: string }[]).map(x => x.id)).toEqual(['a', 'c']);
    expect(props.direction).toBeUndefined();
    expect(typeof props.scheduledRowsFor).toBe('function');
    expect(props.routeShortName).toBe('501');
  });

  it('names each destination no card row carries, and makes no placeholder row (CIV-3169, #1937)', () => {
    // TTC 505 at 4:45 AM: the card has no rows for the hour, its vehicles head to Dundas West and Broadview.
    const veh = (id: string) => ({ id, routeShortName: '505', agencySlug: 'ttc' }) as unknown as LiveVehicle;
    const groups = new Map([['Dundas West', [veh('1'), veh('2')]], ['Broadview', [veh('3')]], [DIRECTION_UNCLEAR, [veh('4')]], ['Empty', []]]);
    expect(unclaimedGroups(groups, new Set()).map(([k, vs]) => [k, vs.length])).toEqual([['Dundas West', 2], ['Broadview', 1]]);
    expect(unclaimedGroups(groups, new Set(['Dundas West'])).map(([k]) => k)).toEqual(['Broadview']);
  });

  it('guard: Studio\'s right-now card never draws the "No destination" placeholder row (CIV-3169)', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'apps', 'studio', 'RouteRightNow.tsx'), 'utf8');
    expect(src).not.toContain('LIVE_UNMATCHED_DESTINATION');
  });

  it('reads the route even with Live mode off, as it polls the vehicles itself (#1750)', () => {
    render(<RouteRightNow slug="ttc" routeShortName="506" direction={null} />);
    expect(card.mock.calls.at(-1)![0].liveEnabled).toBe(true);
  });
});
