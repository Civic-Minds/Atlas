import { describe, expect, it } from 'vitest';
import { LIVE_POLLING_ROUTES, liveFollowsRoute, liveRouteIdNames } from '../livePollingConfig';
import { LIVE_TTC_ANALYSED_ROUTES } from '../rules/live';

/** CIV-3146 (Ryan, "1"): Live shows every analysed TTC route; the one list is LIVE_TTC_ANALYSED_ROUTES, never a copy. */
describe('Live follows every analysed TTC route', () => {
  const routeFile = new Map([...LIVE_TTC_ANALYSED_ROUTES, '9999'].map(r => [`id-${r}`, { shortName: r }] as const));

  it('the routes the Worker answers for are the analysed list plus the polled routes', () => {
    const served = new Set([...liveRouteIdNames('ttc', routeFile).values()].map(r => r.shortName));
    const polled = LIVE_POLLING_ROUTES.filter(r => r.slug === 'ttc').map(r => r.displayRouteShortName);
    expect(served).toEqual(new Set([...LIVE_TTC_ANALYSED_ROUTES, ...polled]));
    expect(served.has('9999')).toBe(false);
  });

  it('the pages follow the same routes', () => {
    for (const r of LIVE_TTC_ANALYSED_ROUTES) expect(liveFollowsRoute('ttc', r)).toBe(true);
    expect(liveFollowsRoute('ttc', '7')).toBe(true);
    expect(liveFollowsRoute('ttc', '9999')).toBe(false);
  });

  it('without a route file only the polled routes are named (the archiver is unchanged)', () => {
    expect(new Set([...liveRouteIdNames('ttc').values()].map(r => r.shortName)).has('7')).toBe(false);
  });
});
