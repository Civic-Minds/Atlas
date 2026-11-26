import { describe, expect, it } from 'vitest';
import { MAP_HIT_PRIORITY, pageMapHitPriority, topMapHit } from '../mapHitTargets';
import { LIVE_CONTEXT_LAYER_IDS } from '../mapLayers';

// A map whose layers each answer with the features "under" the pointer; the box a query used is recorded.
function fakeMap(hits: Record<string, string[]>, missing: string[] = []) {
  const queries: { where: unknown; layers: string[] }[] = [];
  return {
    queries,
    getLayer: (id: string) => (missing.includes(id) ? undefined : { id }),
    queryRenderedFeatures: (where: unknown, options: { layers: string[] }) => {
      queries.push({ where, layers: options.layers });
      return options.layers.flatMap(layer => (hits[layer] ?? []).map(id => ({ id, layer: { id: layer }, properties: { id } })));
    },
  } as never as Parameters<typeof topMapHit>[0] & { queries: { where: unknown; layers: string[] }[] };
}

const P = { x: 100, y: 100 };

describe('map click priority (CIV-1011 #13)', () => {
  it('orders stop, on-demand zone, route', () => {
    expect(MAP_HIT_PRIORITY.map(p => p.kind)).toEqual(['stop', 'serviceArea', 'route']);
  });

  it("Live's context lines open their route (#1878: Burlington 1 and HSR 2 drew only there and took no click)", () => {
    for (const id of LIVE_CONTEXT_LAYER_IDS) expect(topMapHit(fakeMap({ [id]: ['r1'] }), P)?.kind).toBe('route');
  });

  it('a stop inside a zone opens the stop (#1071)', () => {
    const hit = topMapHit(fakeMap({ 'stops-layer': ['s1'], 'on-demand-service-area-fill': ['zone'] }), P);
    expect(hit?.kind).toBe('stop');
  });

  it('a route crossing a zone: a click inside the zone opens the zone (#1073)', () => {
    const hit = topMapHit(fakeMap({ 'on-demand-service-area-fill': ['zone'], 'routes-hit-layer': ['r1'] }), P);
    expect(hit?.kind).toBe('serviceArea');
  });

  it('a stop on a route opens the stop', () => {
    expect(topMapHit(fakeMap({ 'stops-layer': ['s1'], 'routes-hit-layer': ['r1'] }), P)?.kind).toBe('stop');
  });

  it('an on-demand stop point counts as the zone kind, ahead of routes', () => {
    expect(topMapHit(fakeMap({ 'on-demand-stop-points': ['p1'], 'routes-hit-layer': ['r1'] }), P)?.kind).toBe('serviceArea');
  });

  it('Night and Frequent route lines are clickable routes', () => {
    expect(topMapHit(fakeMap({ 'night-service-routes-hit-layer': ['n1'] }), P)?.kind).toBe('route');
    expect(topMapHit(fakeMap({ 'frequent-service-routes-hit-layer': ['f1'] }), P)?.kind).toBe('route');
  });

  it('returns every route under the pointer, for the route chooser', () => {
    const hit = topMapHit(fakeMap({ 'routes-hit-layer': ['r1', 'r2'], 'overview-routes-hit-layer': ['r3'] }), P);
    expect(hit?.features.map(f => f.id).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('routes answer within 12 px; stops and zones only at the point', () => {
    const map = fakeMap({ 'routes-hit-layer': ['r1'] });
    topMapHit(map, P);
    expect(map.queries.map(q => q.where)).toEqual([[100, 100], [100, 100], [[88, 88], [112, 112]]]);
  });

  it('skips layers that are not on the map, and is null over empty map', () => {
    const map = fakeMap({}, ['stops-layer', 'local-routes-hit-layer']);
    expect(topMapHit(map, P)).toBeNull();
    expect(map.queries[0].layers).not.toContain('stops-layer');
    expect(map.queries.flatMap(q => q.layers)).not.toContain('local-routes-hit-layer');
  });
});

// CIV-2189: Studio's map (PageMapLayer) picks by the main map's rule, not its own 6 px box.
describe("a page's drawing picks by the main map's rule (CIV-2189)", () => {
  const rules = pageMapHitPriority(name => `page-${name}`);
  const tol = (kind: string) => MAP_HIT_PRIORITY.find(r => r.kind === kind)!.tolerancePx;

  it('uses the main map\'s distances: stops under the pointer, lines and segments at the route-line distance', () => {
    expect(rules.map(r => [r.kind, r.tolerancePx])).toEqual([['stop', tol('stop')], ['segment', tol('route')], ['line', tol('route')]]);
  });

  it('a stop on a segment opens the stop, a segment over a line opens the segment', () => {
    expect(topMapHit(fakeMap({ 'page-stp': ['s'], 'page-seg': ['g'] }), P, rules)?.kind).toBe('stop');
    expect(topMapHit(fakeMap({ 'page-seg': ['g'], 'page-line': ['l'] }), P, rules)?.kind).toBe('segment');
    expect(topMapHit(fakeMap({ 'page-line-dash': ['l'] }), P, rules)?.kind).toBe('line');
    expect(topMapHit(fakeMap({}), P, rules)).toBeNull();
  });

  it('asks for segments within the route-line box, never a 6 px one', () => {
    const map = fakeMap({ 'page-seg': ['g'] });
    topMapHit(map, P, rules);
    const r = tol('route');
    expect(map.queries.find(q => q.layers.includes('page-seg'))?.where).toEqual([[P.x - r, P.y - r], [P.x + r, P.y + r]]);
  });
});
