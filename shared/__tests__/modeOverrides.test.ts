import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { effectiveMode, isRailLikeRoute, MODE_OVERRIDES, VIRTUAL_LRT_MODE } from '../modes';
import { buildModeFilterClause } from '../tileFilterExprs';
import { generateAgencyIndex, generateModeOverrides } from '../../scripts/agencyIndexGeneration';

const agencyConfigs = () => readdirSync('config/agencies')
  .filter(f => f.endsWith('.json') && f !== 'order.json')
  .map(f => JSON.parse(readFileSync(`config/agencies/${f}`, 'utf8')) as Record<string, unknown>);

const asRoute = (o: (typeof MODE_OVERRIDES)[number]) => ({
  agencySlug: o.agencySlug,
  routeType: o.routeType,
  routeShortName: o.routeShortName ?? '',
  routeLongName: o.routeLongName ?? '',
});

describe('per-route mode overrides (#827)', () => {
  it('shared/data/mode-overrides.json matches config/agencies (run npm run build:agency-index)', () => {
    const generated = generateModeOverrides(generateAgencyIndex('config/agencies').agencies);
    expect(readFileSync('shared/data/mode-overrides.json', 'utf8')).toBe(generated.contents);
    expect(generated.count).toBe(MODE_OVERRIDES.length);
  });

  it('every override has a reason, names a real agency and changes the mode', () => {
    const slugs = new Set(agencyConfigs().map(a => a.slug));
    for (const o of MODE_OVERRIDES) {
      expect(slugs.has(o.agencySlug), o.agencySlug).toBe(true);
      expect(o.reason.length).toBeGreaterThan(10);
      expect(effectiveMode(asRoute(o))).toBe(o.mode);
    }
  });

  it('only applies while the feed still publishes the corrected route_type', () => {
    const qline = MODE_OVERRIDES.find(o => o.agencySlug === 'qline')!;
    expect(effectiveMode({ ...asRoute(qline) })).toBe(0);
    expect(effectiveMode({ ...asRoute(qline), routeType: 0 })).toBe(0);
    expect(effectiveMode({ ...asRoute(qline), routeType: 3 })).toBe(3);
    expect(effectiveMode({ ...asRoute(qline), agencySlug: 'other' })).toBe(2);
  });

  it('corrects the routes named in #827 and #811', () => {
    const at = (agencySlug: string, routeType: number, routeShortName: string, routeLongName = '') =>
      effectiveMode({ agencySlug, routeType, routeShortName, routeLongName });
    expect(at('dart', 0, 'BLUE', 'DART LIGHT RAIL - BLUE LINE')).toBe(VIRTUAL_LRT_MODE);
    expect(at('trimet', 0, '', 'MAX Blue Line')).toBe(VIRTUAL_LRT_MODE);
    expect(at('trimet', 0, 'A', 'Portland Streetcar - A Loop')).toBe(0);
    expect(at('rtd-denver', 0, 'C')).toBe(VIRTUAL_LRT_MODE);
    expect(at('rtd-denver', 2, 'A')).toBe(2); // commuter rail stays as published
    expect(at('metrostlouis', 2, 'MLB')).toBe(VIRTUAL_LRT_MODE);
    expect(at('miami-dade-transit', 2, '2600')).toBe(1);
    expect(at('qline', 2, 'ML')).toBe(0);
    expect(at('nfta', 0, 'Metro Rail', 'Metro Rail')).toBe(VIRTUAL_LRT_MODE);
    expect(at('capmetro', 0, '550', '550-Metro Rail Red Line')).toBe(0);
  });

  it('an overridden route is rail-like only when its corrected mode is', () => {
    expect(isRailLikeRoute({ agencySlug: 'metrostlouis', routeType: 2, routeShortName: 'MLB' })).toBe(true);
    expect(isRailLikeRoute({ agencySlug: 'kenosha', routeType: 3, routeShortName: 'SC' })).toBe(false);
    // The pipeline passes no agencySlug, so overrides never change its tiering.
    expect(isRailLikeRoute({ routeType: 0, routeShortName: 'BLUE' })).toBe(false);
  });

  it('the map filter and effectiveMode agree for every override and a control route', () => {
    const samples = [
      ...MODE_OVERRIDES.map(asRoute),
      ...MODE_OVERRIDES.map(o => ({ ...asRoute(o), routeShortName: 'zz', routeLongName: 'zz' })),
      { agencySlug: 'ttc', routeType: 0, routeShortName: '501', routeLongName: 'Queen' },
      { agencySlug: 'ttc', routeType: 0, routeShortName: '5', routeLongName: 'Line 5 Eglinton' },
      { agencySlug: 'grt', routeType: 2, routeShortName: '301', routeLongName: 'ION light rail' },
      { agencySlug: 'x', routeType: 702, routeShortName: '9', routeLongName: 'Express' },
      { agencySlug: 'x', routeType: 6, routeShortName: 'G', routeLongName: 'Gondola' },
      { agencySlug: 'x', routeType: 4, routeShortName: 'F', routeLongName: 'Ferry' },
    ];
    for (const mode of [0, 1, 2, 3, 4, 6, VIRTUAL_LRT_MODE]) {
      const compiled = featureFilter(buildModeFilterClause(new Set([mode])) as never, {} as never);
      for (const s of samples) {
        const props = { routeType: s.routeType, routeShortName: s.routeShortName, routeLongName: s.routeLongName, agencySlug: s.agencySlug };
        expect(compiled.filter({ zoom: 10 } as never, { type: 2, properties: props } as never), `${JSON.stringify(s)} in mode ${mode}`)
          .toBe(effectiveMode(s) === mode);
      }
    }
  });
});
