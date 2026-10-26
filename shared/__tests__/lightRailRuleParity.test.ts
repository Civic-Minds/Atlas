import { describe, expect, it } from 'vitest';
import { createPropertyExpression, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { buildEffectiveModeExpression, effectiveMode, MODE_OVERRIDES, VIRTUAL_LRT_MODE } from '../modes';

// CIV-993: the map's expression and effectiveMode come from one rule table; this runs the real expression next to it.
const NUMBER_SPEC = { type: 'number', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } } as unknown as StylePropertySpecification;
const compiled = createPropertyExpression(buildEffectiveModeExpression(), 'layers[0].paint.mode', NUMBER_SPEC);
if (compiled.result !== 'success') throw new Error(`effective mode expression does not compile: ${JSON.stringify(compiled.value)}`);
const mapMode = (properties: Record<string, unknown>) => Number(compiled.value.evaluate({ zoom: 10 }, { type: 'LineString', properties } as any));

const cases: Array<[string, number | string, string]> = [
  // Light rail by name
  ['ttc', 0, 'Line 5 Eglinton'], ['ttc', 0, 'LINE 6 Finch West'], ['lacmta', 0, 'Metro A Line'], ['metro-transit', 0, 'METRO Blue Line'],
  ['valleymetro', 0, 'Valley Metro Rail A Line'], ['x', 0, 'CTrain Red'], ['x', 0, 'Capital Line'], ['x', 0, 'Valley Line'], ['x', 0, 'Metro Line'],
  ['grt', 2, 'ION light rail'], ['grt', 2, 'ion'], ['grt', 2, 'Kitchener ION'],
  // Not light rail
  ['valleymetro', 0, 'Valley Metro Streetcar'], ['capmetro', 0, '550-Metro Rail Red Line'], ['x', 0, 'Line A Downtown'], ['x', 0, 'Line '],
  ['x', 0, 'Metro  Line'], ['x', 0, 'Metro Red Blue Line'], ['x', 0, 'King'], ['x', 2, 'Union Station'], ['x', 2, 'STATION EXPRESS'],
  ['x', 3, 'Metro A Line'], ['x', 2, 'Lakeshore West'], ['x', 0, ''],
  // Edge cases: non-ASCII case, stray spaces, punctuation next to ION
  ['x', 2, 'İON'], ['x', 2, ' ION '], ['x', 2, 'ION-Express'], ['x', 2, '(ION)'], ['x', 0, ' Line 5'], ['x', 0, 'Metro A Line '], ['x', 0, 'Metro 2 Line'],
  // Agencies whose every tram is light rail
  ['calgary', 0, 'Anything'], ['edmonton', 0, 'Something'],
];

describe('light-rail rule: map expression and effectiveMode agree (CIV-993)', () => {
  for (const [agencySlug, routeType, routeLongName] of cases) {
    it(`${agencySlug} type ${routeType} "${routeLongName}"`, () => {
      const p = { agencySlug, routeType, routeLongName, routeShortName: '' };
      expect(mapMode(p)).toBe(effectiveMode(p));
    });
  }
  it('still draws the named light-rail lines as light rail and the streetcar as a streetcar', () => {
    expect(effectiveMode({ agencySlug: 'lacmta', routeType: 0, routeLongName: 'Metro A Line' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ agencySlug: 'valleymetro', routeType: 0, routeLongName: 'Valley Metro Streetcar' })).toBe(0);
    expect(effectiveMode({ agencySlug: 'x', routeType: 2, routeLongName: 'Union Station' })).toBe(2);
  });
});

describe('mode overrides: map expression and effectiveMode pick the same routes (#1132)', () => {
  it('every listed override, with its exact names and with stray spaces added', () => {
    for (const o of MODE_OVERRIDES) {
      const exact = { agencySlug: o.agencySlug, routeType: o.routeType, routeShortName: o.routeShortName ?? 'x', routeLongName: o.routeLongName ?? 'x' };
      expect(effectiveMode(exact), `${o.agencySlug} ${o.routeShortName ?? ''} ${o.routeLongName ?? ''}`).toBe(o.mode);
      expect(mapMode(exact)).toBe(o.mode);
      const spaced = { ...exact, routeShortName: ` ${exact.routeShortName} `, routeLongName: ` ${exact.routeLongName} ` };
      expect(mapMode(spaced)).toBe(effectiveMode(spaced));
    }
  });
  it('override names are stored trimmed', () => {
    for (const o of MODE_OVERRIDES) {
      if (o.routeShortName !== undefined) expect(o.routeShortName).toBe(o.routeShortName.trim());
      if (o.routeLongName !== undefined) expect(o.routeLongName).toBe(o.routeLongName.trim());
    }
  });
});

