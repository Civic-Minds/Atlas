import { describe, expect, it } from 'vitest';
import { createPropertyExpression, latest, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { buildDefaultRouteLineOpacityExpression, buildFocusedRouteLineOpacityExpression } from '../colors';
import { buildFocusCase, buildFocusedRoutePaint, buildSelectedRouteLineOpacity, FOCUS_DIM_OPACITY } from '../routeFocus';

const routeMatch = ['==', ['get', 'routeId'], '201'];
const branchMatch = ['all', routeMatch, ['==', ['get', 'directionId'], 0]];
const base = buildDefaultRouteLineOpacityExpression(['get', 'headway']);

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

describe('selected route context opacity (Calgary 201 overnight)', () => {
  it.each([8, 9, 10.3, 11, 14])('preserves background opacity at zoom %s', zoom => {
    const selected = buildSelectedRouteLineOpacity(base, [routeMatch, 1]);
    for (const headway of [6, 30, 9999, 10000]) {
      const background = { routeId: 'other', headway };
      expect(opacity(selected, background, zoom)).toBe(opacity(base, background, zoom));
    }
  });

  it('keeps a selected route visible even when its period fails the zoom gate', () => {
    const selected = buildSelectedRouteLineOpacity(base, [routeMatch, 1]);
    for (const directionId of [0, 1]) {
      expect(opacity(selected, { routeId: '201', directionId, headway: 10000 }, 8)).toBe(1);
    }
  });

  it('preserves branch and core hover emphasis without changing background routes', () => {
    for (const focus of [[branchMatch, 1, routeMatch, 0.4], [routeMatch, 0.4]]) {
      const selected = buildSelectedRouteLineOpacity(base, focus);
      const background = { routeId: 'other', headway: 30 };
      expect(opacity(selected, background)).toBe(opacity(base, background));
      expect(opacity(selected, { routeId: '201', directionId: 1, headway: 30 })).toBe(0.4);
    }
    expect(opacity(buildSelectedRouteLineOpacity(base, [branchMatch, 1, routeMatch, 0.4]),
      { routeId: '201', directionId: 0, headway: 30 })).toBe(1);
  });

  it('retains partial-frequency context and local GeoJSON opacity', () => {
    const partial = buildDefaultRouteLineOpacityExpression(['get', 'headway'], ['==', ['get', 'routeId'], 'partial']);
    expect(opacity(buildSelectedRouteLineOpacity(partial, [routeMatch, 1]),
      { routeId: 'partial', headway: 30 })).toBe(0.35);
    const local = buildSelectedRouteLineOpacity(0.9, [routeMatch, 1]);
    expect(opacity(local, { routeId: 'other' })).toBe(0.9);
    expect(opacity(local, { routeId: '201' })).toBe(1);
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
