import { describe, expect, it } from 'vitest';
import { HEADWAY_FROM_SCHEDULE, LIVE_POLLING_ROUTES } from '../livePollingConfig';

// CIV-2897 (Ryan, 2026-11-24): Hamilton's and Burlington's Live routes take their scheduled headway from the published
// schedule (shared/data/live-scheduled-headways.json, scripts/live-route-setup.ts headways), never a typed number.
describe('Live scheduled headways come from the published schedule', () => {
  it('every Hamilton and Burlington Live route has one, including HSR 02, 20 and 51', () => {
    const routes = LIVE_POLLING_ROUTES.filter(r => (HEADWAY_FROM_SCHEDULE as readonly string[]).includes(r.slug) && !r.vehiclesOnly);
    expect(routes.filter(r => r.slug === 'hamilton').map(r => r.displayRouteShortName).sort()).toEqual(['01', '02', '10', '20', '51']);
    for (const r of routes) expect(Number.isFinite(r.scheduledHeadwayMin), `${r.slug} ${r.displayRouteShortName}`).toBe(true);
  });
});
