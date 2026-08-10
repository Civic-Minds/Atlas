import { describe, expect, it } from 'vitest';
import { routeDataQualityWarningForShape } from '../routeDataQuality';

const anomaly = {
  shapeId: 'bad-shape',
  truncated: false,
  deinterleaved: false,
  clusteredJumps: true,
  repairedClusteredJumps: false,
  knownIsolatedPointFixed: false,
} as const;

describe('routeDataQualityWarningForShape', () => {
  it('warns when the parser explicitly flagged the selected shape', () => {
    expect(routeDataQualityWarningForShape('bad-shape', [anomaly])).toBe('shape-anomaly');
  });

  it('does not generalize a warning to unrelated shapes', () => {
    expect(routeDataQualityWarningForShape('good-shape', [anomaly])).toBeUndefined();
    expect(routeDataQualityWarningForShape('bad-shape', undefined)).toBeUndefined();
  });
});
