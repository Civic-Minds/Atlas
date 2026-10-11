import { describe, expect, it } from 'vitest';
import { createPropertyExpression, latest, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { buildFocusedRouteLineOpacityExpression } from '../colors';
import { buildFocusCase, buildFocusedRoutePaint, FOCUS_DIM_OPACITY } from '../routeFocus';

const routeMatch = ['==', ['get', 'routeId'], '201'];

function opacity(expression: unknown, properties: Record<string, unknown>, zoom = 10.3) {
  const compiled = createPropertyExpression(
    expression,
    'layers[0].paint.line-opacity',
    latest.paint_line['line-opacity'] as StylePropertySpecification,
  );
  expect(compiled.result).toBe('success');
  if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom }, { type: 'LineString', properties });
}

describe('selected route fades the rest of the network', () => {
  const focused = buildFocusedRouteLineOpacityExpression(routeMatch, ['get', 'headway']);

  it.each([8, 10.3, 14])('dims other routes to the shared fade at zoom %s', zoom => {
    expect(opacity(focused, { routeId: 'other', headway: 6 }, zoom)).toBeCloseTo(FOCUS_DIM_OPACITY);
  });

  it('keeps a selected route visible even when its period fails the zoom gate', () => {
    for (const directionId of [0, 1]) {
      expect(opacity(focused, { routeId: '201', directionId, headway: 10000 }, 8)).toBe(1);
    }
  });
});

describe('shared selection fade (routes and on-demand zones)', () => {
  const onDemandMatch = ['!=', ['get', 'onDemandFocused'], false];
  const normal = ['case', ['==', ['get', 'hoursConfirmed'], false], 0.4, 0.95];
  const paint = buildFocusCase(onDemandMatch, normal, FOCUS_DIM_OPACITY);

  it('fades on-demand features outside the selection to the route fade value', () => {
    expect(opacity(paint, { onDemandFocused: false })).toBe(FOCUS_DIM_OPACITY);
    expect(opacity(paint, { onDemandFocused: true })).toBe(0.95);
  });

  it('keeps normal styling with no selection, and muted hours stay muted when selected', () => {
    expect(opacity(paint, {})).toBe(0.95);
    expect(opacity(paint, { onDemandFocused: true, hoursConfirmed: false })).toBe(0.4);
  });

  it('uses the same case builder as fixed-route focus', () => {
    expect(buildFocusedRoutePaint(routeMatch).opacity).toEqual(buildFocusCase(routeMatch, 1, FOCUS_DIM_OPACITY));
  });

  it('fades every fixed route when an on-demand zone is selected, without revealing zoom-gated ones', () => {
    const faded = buildFocusedRouteLineOpacityExpression(['==', ['get', 'routeId'], ''], ['get', 'headway']);
    expect(opacity(faded, { routeId: '201', headway: 10 })).toBe(FOCUS_DIM_OPACITY);
    expect(opacity(faded, { routeId: '201', headway: 10000 }, 8)).toBe(0);
  });
});
