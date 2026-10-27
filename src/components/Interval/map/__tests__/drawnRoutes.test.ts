import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAWN_ROUTE_LAYERS, queryDrawnRouteFeatures } from '../drawnRoutes';

/** Every other layer the map adds, and why it is not a drawn route line (CIV-989). A new layer fails until it is sorted. */
const NOT_DRAWN_ROUTES: Record<string, string> = {
  'overview-routes-hit-layer': 'invisible click target', 'routes-hit-layer': 'invisible click target',
  'local-routes-hit-layer': 'invisible click target', 'night-service-routes-hit-layer': 'invisible click target',
  'frequent-service-routes-hit-layer': 'invisible click target', 'frequency-qualifying-segments-hit-layer': 'invisible click target',
  'shared-hover-segments-layer': 'hover highlight over a route already drawn',
  'debug-highlight-layer': 'debug overlay',
  'history-routes-layer': 'History app, counted by its own view',
  'live-route-shape-layer': 'Live', 'live-stretch-layer': 'Live',
  'on-demand-service-area-fill': 'on-demand zone, not a route', 'on-demand-service-area-line': 'on-demand zone outline',
  'on-demand-stop-points': 'on-demand stops', 'stops-layer': 'stops',
  'vehicles-dots': 'Live vehicles', 'vehicles-focus-ring': 'Live vehicles', 'vehicles-labels': 'Live vehicles',
};

const MAP_DIR = resolve(__dirname, '..');
const layerIds = () => {
  const files = [...readdirSync(MAP_DIR).filter(f => /\.tsx?$/.test(f)).map(f => join(MAP_DIR, f)), resolve(MAP_DIR, '../MapCanvas.tsx')];
  return [...new Set(files.flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\bid: '([a-z0-9-]+)'/g)].map(m => m[1])))];
};

describe('drawn route layers (CIV-989)', () => {
  it('every map layer is either a drawn route line or listed with why not', () => {
    const unsorted = layerIds().filter(id => !(DRAWN_ROUTE_LAYERS as readonly string[]).includes(id) && !(id in NOT_DRAWN_ROUTES));
    expect(unsorted).toEqual([]);
    for (const id of DRAWN_ROUTE_LAYERS) expect(layerIds(), id).toContain(id);
  });

  it('counts a route drawn only by a segment layer, and skips hidden layers and zero-opacity lines (#1090)', () => {
    const feature = (layer: string, routeId: string, opacity = 1) => ({ layer: { id: layer, paint: { 'line-opacity': opacity } }, properties: { routeId } });
    const rendered = [feature('routes-layer', 'a'), feature('frequency-qualifying-segments-layer', 'purple'), feature('overview-routes-layer', 'faded', 0)];
    const map = {
      getLayer: (id: string) => id !== 'night-service-routes-layer',
      getLayoutProperty: (id: string) => (id === 'frequent-service-routes-layer' ? 'none' : 'visible'),
      queryRenderedFeatures: (_box: unknown, opts: { layers: string[] }) => {
        expect(opts.layers).toContain('frequency-qualifying-segments-layer');
        expect(opts.layers).not.toContain('frequent-service-routes-layer');
        expect(opts.layers).not.toContain('night-service-routes-layer');
        return rendered.filter(f => opts.layers.includes(f.layer.id));
      },
    };
    expect(queryDrawnRouteFeatures(map as any).map(f => f.properties.routeId)).toEqual(['a', 'purple']);
  });
});
