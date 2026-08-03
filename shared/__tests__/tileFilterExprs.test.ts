import { describe, it, expect } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { buildModeFilterClause, tileEffectiveHeadwayExpr } from '../tileFilterExprs';
import { flattenPeriodHeadwayProps } from '../pmtilesProps';
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

  // MVT (what PMTiles actually serves) has no null type -- a flat property written as null is
  // silently dropped by tippecanoe, not preserved the way the test above assumes. Real tiles then
  // have the key genuinely absent, has() returns false, and this fell through to the all-day
  // fallback -- letting an overnight-only route (TTC 320) pass a midday filter on its overnight
  // headway. flattenPeriodHeadwayProps writes a sentinel instead of null specifically so this
  // stays caught once the property has gone through the real tippecanoe-bound flattening step,
  // not just in a hand-built test feature (issue #297 follow-up).
  it('still excludes a period with no service after going through the real flatten step (not just a hand-built null property)', () => {
    const props: Record<string, unknown> = {
      headway: 5,
      worstDirectionHeadway: 5,
      headwayByPeriod: { midday: null, overnight: 5 },
      worstDirectionHeadwayByPeriod: { midday: null, overnight: 5 },
    };
    flattenPeriodHeadwayProps(props);
    // Simulates what actually reaches the client: no `hph_midday`/`wdph_midday` null property
    // survives MVT encoding -- only the sentinel-bearing keys flattenPeriodHeadwayProps wrote.
    const compiled = featureFilter(periodFilter('midday' as any, 10) as any);
    const ctx = { zoom: 10 };
    expect(compiled.filter(ctx, feat(props) as any)).toBe(false);
  });

  it('requires wdph (worst-direction) to qualify, not just this feature\'s own hph (#314)', () => {
    const compiled = featureFilter(periodFilter('late', 30) as any);
    const ctx = { zoom: 10 };
    // Kingston 701 case: this direction's own late-period headway (10) would pass a 30-min
    // filter alone, but the route's worst direction (45) doesn't -- must fail.
    expect(compiled.filter(ctx, feat({
      hph_late: 10,
      wdph_late: 45,
      headway: 10,
    }) as any)).toBe(false);
    // msph (min-stop / shared-core) must not smuggle a route past the filter either -- it can
    // reflect a combined frequency for only part of the line, and there's no clipping to match
    // it to (#315). Only wdph/hph decide pass/fail here.
    expect(compiled.filter(ctx, feat({
      msph_late: 1,
      hph_late: 45,
      headway: 45,
    }) as any)).toBe(false);
    expect(compiled.filter(ctx, feat({
      hph_late: 10,
      wdph_late: 10,
      headway: 10,
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
