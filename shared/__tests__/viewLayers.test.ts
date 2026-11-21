import { describe, expect, it } from 'vitest';
import { ON_DEMAND_MODE } from '../modes';
import { FREQUENCY_RESEARCH_VIEWS, mapDrawsOnDemand, mapViewKind, modesForView, viewAllowsOnDemand, viewShowsOnDemand } from '../viewLayers';

describe('viewLayers', () => {
  it('maps view flags to a view kind', () => {
    expect(mapViewKind({})).toBe('map');
    expect(mapViewKind({ nightServiceView: true })).toBe('night');
    expect(mapViewKind({ frequentServiceView: true })).toBe('frequent-service');
    expect(mapViewKind({ liveRoutesOnly: true })).toBe('live');
  });

  it('never allows on-demand in frequency research views', () => {
    for (const view of FREQUENCY_RESEARCH_VIEWS) expect(viewAllowsOnDemand(view)).toBe(false);
    expect(viewAllowsOnDemand('map')).toBe(true);
    expect(viewAllowsOnDemand('live')).toBe(true);
  });

  it('drops the on-demand mode option only in research views', () => {
    const modes = [{ id: 3 }, { id: ON_DEMAND_MODE }];
    expect(modesForView(modes, 'frequent-service').map(m => m.id)).toEqual([3]);
    expect(modesForView(modes, 'map')).toEqual(modes);
  });

  it('shows on-demand when the view allows it and the Mode filter is off or includes it', () => {
    expect(viewShowsOnDemand('map', new Set())).toBe(true);
    expect(viewShowsOnDemand('map', new Set([ON_DEMAND_MODE]))).toBe(true);
    expect(viewShowsOnDemand('map', new Set([3]))).toBe(false);
    expect(viewShowsOnDemand('night', new Set())).toBe(false);
  });

  it('draws (and so loads and reports) on-demand areas only with route layers on: never in Studio (#1635)', () => {
    expect(mapDrawsOnDemand('map', new Set(), true)).toBe(true);
    expect(mapDrawsOnDemand('map', new Set(), false)).toBe(false);
    expect(mapDrawsOnDemand('night', new Set(), true)).toBe(false);
  });
});
