import { describe, expect, it } from 'vitest';
import {
  compactDate, effectiveDataset, excludeAgenciesClause, layersWithUpcoming, todayCompact, upcomingEntries,
  upcomingIndexUrl, upcomingRoutesUrl,
} from '../upcomingNetwork';

const fc = (id: string): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeId: id } }] });

describe('upcoming network index (CIV-1252)', () => {
  const index = [
    { slug: 'hsr', feedStart: '2027-09-06', feedVersion: 'v2', routes: 30, stops: 2000 },
    { slug: 'mcts', feedStart: '20261104' },
    { slug: 'started', feedStart: '2026-11-03' },
    { slug: 'past', feedStart: '2026-10-01' },
    { slug: 'no-start' },
    { slug: '../bad', feedStart: '2027-01-01' },
    { slug: 'hsr', feedStart: '2027-12-01' },
  ];

  it("hides an entry once its feed starts today or earlier, and drops unreadable or repeated ones", () => {
    expect(upcomingEntries(index, '20261103').map(e => e.slug)).toEqual(['hsr', 'mcts']);
    expect(upcomingEntries(index, '20261104').map(e => e.slug)).toEqual(['hsr']);
  });

  it('keeps only agencies the catalog shows, and reads the { generatedAt, agencies } file or junk safely', () => {
    expect(upcomingEntries(index, '20261103', new Set(['mcts'])).map(e => e.slug)).toEqual(['mcts']);
    expect(upcomingEntries({ generatedAt: '2026-11-03T19:11:02Z', agencies: index }, '20261103').map(e => e.slug)).toEqual(['hsr', 'mcts']);
    expect(upcomingEntries(null, '20261103')).toEqual([]);
    expect(upcomingEntries('nope', '20261103')).toEqual([]);
  });

  it('reads both date forms and today on the viewer clock', () => {
    expect(compactDate('2027-09-06')).toBe('20270906');
    expect(compactDate('20270906')).toBe('20270906');
    expect(compactDate('Sept 6')).toBeNull();
    expect(todayCompact(new Date(2026, 10, 3, 23, 59))).toBe('20261103');
  });

  it('reads the files from atlas/upcoming/', () => {
    expect(upcomingIndexUrl('/beta-data')).toBe('/beta-data/atlas/upcoming/index.json');
    expect(upcomingRoutesUrl('/beta-data', 'hsr')).toBe('/beta-data/atlas/upcoming/hsr.json');
  });
});

describe('map B on the upcoming network (CIV-1252)', () => {
  it('shows the upcoming network only when asked and something is there; otherwise the current one', () => {
    expect(effectiveDataset('upcoming', true)).toBe('upcoming');
    expect(effectiveDataset('upcoming', false)).toBe('current');
    expect(effectiveDataset(undefined, true)).toBe('current');
    expect(effectiveDataset('current', true)).toBe('current');
  });

  it('swaps only the agencies with a loaded upcoming file; the rest keep their current routes', () => {
    const current = { hsr: fc('old'), ttc: fc('504') };
    const merged = layersWithUpcoming(current, { hsr: fc('new') });
    expect(merged.hsr.features[0].properties?.routeId).toBe('new');
    expect(merged.ttc).toBe(current.ttc);
    expect(layersWithUpcoming(current, {})).toBe(current);
  });

  it('keeps the release tiles from drawing those agencies', () => {
    expect(excludeAgenciesClause(['hsr'])).toEqual(['!', ['in', ['get', 'agencySlug'], ['literal', ['hsr']]]]);
    expect(excludeAgenciesClause([])).toBeNull();
  });
});
