import { describe, expect, it } from 'vitest';
import { pruneAgencyLayers, MAX_AGENCY_LAYERS_IN_REACT } from '../agencyLayerPrune';
import type { Agency } from '../../App';
import type { AgencyLayers } from '../useAgencyData';

function agency(slug: string, lat: number, lon: number): Agency {
  return {
    slug,
    name: slug,
    center: [lat, lon],
    url: `https://example.com/${slug}.json`,
    bbox: [lat - 0.1, lon - 0.1, lat + 0.1, lon + 0.1],
  };
}

function layers(...slugs: string[]): AgencyLayers {
  const out: AgencyLayers = {};
  for (const s of slugs) {
    out[s] = { type: 'FeatureCollection', features: [] };
  }
  return out;
}

describe('pruneAgencyLayers', () => {
  it('returns null when under the cap', () => {
    const agencies = [agency('a', 43, -79), agency('b', 44, -80)];
    const result = pruneAgencyLayers(
      layers('a', 'b'),
      agencies,
      { s: 42, w: -81, n: 45, e: -78 },
      new Set(),
      24,
    );
    expect(result).toBeNull();
  });

  it('drops farthest agencies outside the viewport first', () => {
    const agencies = Array.from({ length: 30 }, (_, i) =>
      agency(`a${i}`, 43 + i * 0.5, -79),
    );
    // Viewport around a0 only
    const bounds = { s: 42.9, w: -79.2, n: 43.2, e: -78.8 };
    const all = layers(...agencies.map(a => a.slug));
    const result = pruneAgencyLayers(all, agencies, bounds, new Set(), 5);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.layers).filter(k => !k.endsWith('-corridors')).length).toBe(5);
    expect(result!.layers['a0']).toBeDefined(); // in viewport
    expect(result!.dropped.length).toBe(25);
  });

  it('never drops pinned slugs before others', () => {
    const agencies = [
      agency('near', 43, -79),
      agency('pinned-far', 50, -100),
      ...Array.from({ length: 28 }, (_, i) => agency(`x${i}`, 40 + i * 0.01, -80)),
    ];
    const all = layers(...agencies.map(a => a.slug));
    const result = pruneAgencyLayers(
      all,
      agencies,
      { s: 42.9, w: -79.2, n: 43.2, e: -78.8 },
      new Set(['pinned-far']),
      5,
    );
    expect(result!.layers['pinned-far']).toBeDefined();
    expect(result!.layers['near']).toBeDefined();
  });

  it('exports a sensible default max', () => {
    expect(MAX_AGENCY_LAYERS_IN_REACT).toBeGreaterThanOrEqual(12);
    expect(MAX_AGENCY_LAYERS_IN_REACT).toBeLessThanOrEqual(48);
  });
});
