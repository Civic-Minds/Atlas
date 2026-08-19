import { describe, expect, it } from 'vitest';
import { unevenPeriodMaxGap } from '../routeCardUneven';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

function branch(headway: number, maxGap: number): ShapeProperties {
  return {
    routeId: `${headway}-${maxGap}`,
    headway,
    tier: String(headway),
    headwayByPeriod: { midday: headway },
    headwayByPeriodSustained: { midday: false },
    maxGapByPeriod: { midday: maxGap },
    stopOrder: ['a', 'b', 'c'],
  } as ShapeProperties;
}

describe('unevenPeriodMaxGap', () => {
  it('suppresses a branch warning when combined service is materially more frequent', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(30, 32), branch(30, 60)] },
    ], 'midday')).toBe(0);
  });

  it('keeps the warning for a single branch with an unsustained period', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(30, 45)] },
    ], 'midday')).toBe(45);
  });
});
