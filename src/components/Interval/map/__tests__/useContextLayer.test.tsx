import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMetric } from '../../../../utils/contextLayer';

function fakeMap() {
  return {
    getSource: vi.fn(() => undefined), getLayer: vi.fn(() => undefined), hasImage: vi.fn(() => false),
    addSource: vi.fn(), addLayer: vi.fn(), addImage: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn(),
    setFilter: vi.fn(), setPaintProperty: vi.fn(), on: vi.fn(), off: vi.fn(),
    getCanvas: vi.fn(() => document.createElement('canvas')), queryRenderedFeatures: vi.fn(() => []), querySourceFeatures: vi.fn(() => []),
  };
}

async function load(env: Record<string, string>, dev: boolean) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const config = await import('../../../../../shared/config');
  const hook = await import('../useContextLayer');
  return { config, ...hook };
}

describe('context layer is inert unless the flag and a data URL are set', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  for (const [name, env, dev] of [
    ['public', { VITE_ATLAS_MODE: 'public', VITE_CONTEXT_LAYER_URL: '' }, false],
    ['public with a URL set (built site ignores it)', { VITE_ATLAS_MODE: 'public', VITE_CONTEXT_LAYER_URL: '/dev-context/context.pmtiles' }, false],
    ['beta build, no URL', { VITE_ATLAS_MODE: 'beta', VITE_CONTEXT_LAYER_URL: '' }, false],
    ['beta build with a URL (built site ignores it)', { VITE_ATLAS_MODE: 'beta', VITE_CONTEXT_LAYER_URL: '/dev-context/context.pmtiles' }, false],
  ] as const) {
    it(`${name}: no source, no layer, no control`, async () => {
      const { config, useContextLayer, contextLayerAvailable } = await load(env, dev);
      expect(contextLayerAvailable()).toBe(false);
      if (env.VITE_ATLAS_MODE === 'public') expect(config.FEATURES.contextLayer).toBe(false);
      const map = fakeMap();
      function Harness() { const ref = useRef(map as never); useContextLayer(ref, true, 'density' as ContextMetric); return null; }
      render(<Harness />);
      expect(map.addSource).not.toHaveBeenCalled();
      expect(map.addLayer).not.toHaveBeenCalled();
      expect(map.addImage).not.toHaveBeenCalled();
      expect(map.on).not.toHaveBeenCalled();
    });
  }

  it('dev with a URL and a metric adds the source and layers; no metric adds nothing', async () => {
    const { useContextLayer, contextLayerAvailable } = await load({ VITE_ATLAS_MODE: 'dev', VITE_CONTEXT_LAYER_URL: '/dev-context/context.pmtiles' }, true);
    expect(contextLayerAvailable()).toBe(true);
    // jsdom has no 2D canvas; the hatch tile only needs something to draw on.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, getImageData: () => ({}) } as never);
    const off = fakeMap();
    function Off() { const ref = useRef(off as never); useContextLayer(ref, true, null); return null; }
    render(<Off />);
    expect(off.addSource).not.toHaveBeenCalled();
    const on = fakeMap();
    function On() { const ref = useRef(on as never); useContextLayer(ref, true, 'income'); return null; }
    render(<On />);
    expect(on.addSource).toHaveBeenCalledWith('context-pmtiles', expect.objectContaining({ url: 'pmtiles:///dev-context/context.pmtiles' }));
    expect(on.addLayer).toHaveBeenCalledTimes(3);
  });
});
