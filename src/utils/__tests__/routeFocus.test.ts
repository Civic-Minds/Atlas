import { describe, expect, it } from 'vitest';
import { createPropertyExpression, latest, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { buildFocusedRouteLineOpacityExpression } from '../colors';
import { buildFocusCase, buildFocusedRoutePaint, FOCUS_DIM_OPACITY, focusOpacity } from '../routeFocus';

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

describe('the same selection fade for Live vehicles (focusOpacity)', () => {
  const v = (id: string, routeShortName: string, agencySlug = 'ttc') => ({ id, routeShortName, agencySlug });

  it('keeps every vehicle at full strength with nothing picked', () => {
    expect(focusOpacity(v('1', '504'), null)).toBe(1);
    expect(focusOpacity(v('2', '506'), undefined)).toBe(1);
  });

  it('fades every other route to the shared fade value when a route is picked', () => {
    const focus = { agencySlug: 'ttc', routeShortName: '504' };
    expect(focusOpacity(v('1', '504'), focus)).toBe(1);
    expect(focusOpacity(v('2', '506'), focus)).toBe(FOCUS_DIM_OPACITY);
    expect(focusOpacity(v('3', '504', 'yrt'), focus)).toBe(FOCUS_DIM_OPACITY);
  });

  it('fades the same route\'s other directions when one direction is picked', () => {
    const focus = { agencySlug: 'ttc', routeShortName: '504', ids: ['1', '4'] };
    expect(focusOpacity(v('1', '504'), focus)).toBe(1);
    expect(focusOpacity(v('4', '504'), focus)).toBe(1);
    expect(focusOpacity(v('2', '504'), focus)).toBe(FOCUS_DIM_OPACITY);
    // An id match on another route never brings that route back.
    expect(focusOpacity(v('1', '506'), focus)).toBe(FOCUS_DIM_OPACITY);
  });
});
