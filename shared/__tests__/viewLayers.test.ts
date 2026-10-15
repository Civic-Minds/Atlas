import { describe, expect, it } from 'vitest';
import { ON_DEMAND_MODE } from '../modes';
import { FREQUENCY_RESEARCH_VIEWS, mapViewKind, modesForView, viewAllowsOnDemand } from '../viewLayers';

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
});
