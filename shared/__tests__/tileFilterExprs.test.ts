import { describe, it, expect } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { buildModeFilterClause, tileEffectiveHeadwayExpr } from '../tileFilterExprs';
import { VIRTUAL_LRT_MODE } from '../modes';

function productionLikeFilter(maxHeadway: number, modes = new Set<number>()) {
  const clauses: unknown[] = [
    ['==', ['get', 'day'], 'Weekday'],
    ['==', ['get', 'directionId'], 0],
  ];
  if (maxHeadway !== Infinity) {
    clauses.push(['<=', tileEffectiveHeadwayExpr('all'), maxHeadway]);
  }
  const modeClause = buildModeFilterClause(modes);
  if (modeClause) clauses.push(modeClause);
  return ['all', ...clauses];
}

function periodFilter(period: 'late', maxHeadway: number) {
  return ['all', ['<=', tileEffectiveHeadwayExpr(period), maxHeadway]];
}

const feat = (properties: Record<string, unknown>) => ({ type: 2, properties });

describe('tileEffectiveHeadwayExpr', () => {
  it('compiles with direction/day clauses (MapLibre filter-safe)', () => {
    expect(() => featureFilter(productionLikeFilter(10) as any)).not.toThrow();
  });

  it('filters high headway routes at ≤10m', () => {
    const compiled = featureFilter(productionLikeFilter(10) as any);
    const ctx = { zoom: 10 };
    expect(compiled.filter(ctx, feat({
      day: 'Weekday',
      directionId: 0,
      worstDirectionHeadway: 60,
      headway: 60,
    }) as any)).toBe(false);
    expect(compiled.filter(ctx, feat({
      day: 'Weekday',
      directionId: 0,
      worstDirectionHeadway: 10,
      headway: 10,
    }) as any)).toBe(true);
  });

  it('does not fall back to all-day service when the active period is explicit null', () => {
    const compiled = featureFilter(periodFilter('late', 15) as any);
    const ctx = { zoom: 10 };
    expect(compiled.filter(ctx, feat({
      hph_late: null,
      headway: 10,
    }) as any)).toBe(false);
    expect(compiled.filter(ctx, feat({
      hph_late: 15,
      headway: 60,
    }) as any)).toBe(true);
  });
});

describe('buildModeFilterClause', () => {
  it('returns null when no modes selected', () => {
    expect(buildModeFilterClause(new Set())).toBeNull();
  });

  it('compiles bus + LRT mode filter with headway clause', () => {
    const filter = productionLikeFilter(30, new Set([3, VIRTUAL_LRT_MODE]));
    expect(() => featureFilter(filter as any)).not.toThrow();
  });
});
