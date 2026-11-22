import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const card = vi.fn((_props: Record<string, unknown>) => null);
vi.mock('../components/Live/LiveRoutePerformance', () => ({ default: (p: Record<string, unknown>) => card(p) }));
vi.mock('../hooks/useAgencies', () => ({ useAgencies: () => ({ agencies: [] }) }));
const v = (id: string, routeShortName: string) => ({ id, routeShortName, agencySlug: 'ttc' });
vi.mock('../hooks/useLiveFeeds', () => ({ useLiveFeeds: () => ({ vehiclesBySlug: { ttc: [v('a', '501'), v('b', '504'), v('c', '501')] }, degradedBySlug: {}, errorBySlug: {} }) }));
vi.mock('../lib/agencyGeo', () => ({ getCachedAgencyGeo: () => undefined, fetchAgencyGeo: () => new Promise(() => {}) }));

import RouteRightNow from '../apps/studio/RouteRightNow';

describe("Studio's Live route panel shows main Live's right-now card (CIV-2021)", () => {
  it("hands the card the route's own live vehicles and the panel's direction", () => {
    render(<RouteRightNow slug="ttc" routeShortName="501" direction={1} />);
    const props = card.mock.calls.at(-1)![0];
    expect((props.vehicles as { id: string }[]).map(x => x.id)).toEqual(['a', 'c']);
    expect(props.direction).toBe(1);
    expect(props.routeShortName).toBe('501');
  });
});
