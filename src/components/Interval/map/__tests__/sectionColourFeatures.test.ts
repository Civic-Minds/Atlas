import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sectionColourFeatures } from '../useSectionColours';
import { buildSectionColourFeatures } from '../../../../utils/sectionColours';
import { passesRouteFilter, type ShapeProperties } from '../../../../hooks/useIntervalStats';

// GO Barrie weekday, cut from the published release-mwgrzbgq route and sections files.
const barrie = JSON.parse(readFileSync(resolve(__dirname, '../../../../utils/__tests__/fixtures/go-br-weekday.json'), 'utf8')) as GeoJSON.FeatureCollection;

/** The map's own filter (useIntervalStats' mapFilteredLayers), on the fixture. */
const mapFiltered = (maxHeadway: number, period: 'midday' | 'pmPeak') => ({
  go: { ...barrie, features: barrie.features.filter(f => passesRouteFilter(f.properties as ShapeProperties, 'go', {
    maxHeadway, agencies: new Set(['go']), modes: new Set(), day: 'Weekday', period, selectedRoute: 'go::09261126-BR',
  }, null)) },
});
const input = (maxHeadway: number) => ({
  mapFilteredLayers: mapFiltered(maxHeadway, 'midday'), period: 'midday' as const, day: 'Weekday' as const, colorMode: 'default' as const,
  showRouteLayers: true, nightServiceView: false, frequentServiceView: false, enabled: true,
});

describe('sectionColourFeatures (#1504)', () => {
  it('draws no section of a selected route the map filter hides: GO Barrie at weekday midday, every 60 or less', () => {
    const lines = mapFiltered(60, 'midday').go.features.filter(f => (f.properties as ShapeProperties).stopId == null);
    expect(lines).toHaveLength(0);
    expect(sectionColourFeatures(input(60))).toEqual([]);
  });

  it('builds the same pieces as the unfiltered lines once the route passes the filter', () => {
    expect(mapFiltered(Infinity, 'midday').go.features).toHaveLength(barrie.features.length);
    expect(sectionColourFeatures(input(Infinity))).toEqual(buildSectionColourFeatures({ go: barrie }, 'Weekday', 'default', undefined, 'midday'));
  });

  it('draws nothing off beta or outside the frequency map', () => {
    expect(sectionColourFeatures({ ...input(Infinity), enabled: false })).toEqual([]);
    expect(sectionColourFeatures({ ...input(Infinity), nightServiceView: true })).toEqual([]);
  });
});
