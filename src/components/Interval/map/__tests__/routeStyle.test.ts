import { describe, expect, it } from 'vitest';
import { createPropertyExpression, latest, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { HEADWAY_TIERS } from '../../../../utils/colors';
import {
  FREQUENT_SERVICE_WIDTH_BY_ZOOM,
  NIGHT_SERVICE_WIDTH_BY_ZOOM,
  OVERLAY_ROUTE_OPACITY,
  RESEARCH_OVERLAY_LAYERS,
  frequentServiceColorExpression,
  researchOverlayPaint,
} from '../routeStyle';

type Prop = 'line-opacity' | 'line-width' | 'line-color';

function evaluate(property: Prop, expression: unknown, properties: Record<string, unknown>, zoom = 11) {
  const compiled = createPropertyExpression(
    expression,
    `layers[0].paint.${property}`,
    latest.paint_line[property] as StylePropertySpecification,
  );
  expect(compiled.result).toBe('success');
  if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom }, { type: 'LineString', properties });
}

const selected = { agencySlug: 'ttc', routeId: '501' };
const other = { agencySlug: 'ttc', routeId: '504' };

describe('research overlay fade (Night and Frequent Service)', () => {
  it('lists both overlay layers with their own default width', () => {
    expect(RESEARCH_OVERLAY_LAYERS.map(l => [l.id, l.width])).toEqual([
      ['night-service-routes-layer', NIGHT_SERVICE_WIDTH_BY_ZOOM],
      ['frequent-service-routes-layer', FREQUENT_SERVICE_WIDTH_BY_ZOOM],
    ]);
  });

  it('with nothing selected, keeps the layer opacity and its own width', () => {
    for (const { width } of RESEARCH_OVERLAY_LAYERS) {
      const paint = researchOverlayPaint(width, null);
      expect(paint.opacity).toBe(OVERLAY_ROUTE_OPACITY);
      expect(paint.width).toBe(width);
    }
  });

  it('with a route selected, the selected route stays bright and the rest fade with the shared focus paint', () => {
    for (const { width } of RESEARCH_OVERLAY_LAYERS) {
      const paint = researchOverlayPaint(width, 'ttc::501');
      expect(evaluate('line-opacity', paint.opacity, selected)).toBe(1);
      expect(evaluate('line-opacity', paint.opacity, other)).toBe(0.18);
      expect(evaluate('line-width', paint.width, selected)).toBe(3.5);
      expect(evaluate('line-width', paint.width, other)).toBe(1.25);
    }
  });
});

describe('frequent service colour and width', () => {
  it('default colours are the every-15 and every-30 tier colours', () => {
    const color = frequentServiceColorExpression('default');
    const tier = (max: number) => HEADWAY_TIERS.find(t => t.max === max)!.color;
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const asRgb = (c: any) => [c.r, c.g, c.b];
    expect(asRgb(evaluate('line-color', color, { frequentServiceBand: '15' }))).toEqual(rgb(tier(15)));
    expect(asRgb(evaluate('line-color', color, { frequentServiceBand: '30' }))).toEqual(rgb(tier(30)));
  });

  it('every-15 lines are wider than every-30 lines at each zoom', () => {
    for (const [zoom, w15, w30] of [[8, 3.2, 2.0], [11, 3.8, 2.5], [14, 4.6, 3.2], [17, 6.0, 4.5]]) {
      expect(evaluate('line-width', FREQUENT_SERVICE_WIDTH_BY_ZOOM, { frequentServiceBand: '15' }, zoom)).toBeCloseTo(w15);
      expect(evaluate('line-width', FREQUENT_SERVICE_WIDTH_BY_ZOOM, { frequentServiceBand: '30' }, zoom)).toBeCloseTo(w30);
    }
  });
});
