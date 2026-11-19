import { describe, expect, it } from 'vitest';
import { STUDIO_CUTOFF_PRESETS } from './StudioCutoffs';
import { CUTOFF_LIMITS, DEFAULT_CUTOFFS, cutoffFactorText, cutoffMinutesText, cutoffsFrom } from '../../../shared/liveCutoffs';

describe("Studio's cut-off choices (CIV-1886)", () => {
  it('every choice is one the shared check accepts, and each list holds the standard', () => {
    const arg = { lateAfterMin: 'late_after_min', earlyBeforeMin: 'early_before_min', bunchedWithinMin: 'bunched_within_min', gappedFactor: 'gapped_factor' } as const;
    for (const k of Object.keys(CUTOFF_LIMITS) as Array<keyof typeof CUTOFF_LIMITS>) {
      for (const v of STUDIO_CUTOFF_PRESETS[k]) expect(() => cutoffsFrom({ [arg[k]]: v })).not.toThrow();
      expect(STUDIO_CUTOFF_PRESETS[k]).toContain(DEFAULT_CUTOFFS[k]);
    }
  });
  it('writes cut-offs in halves', () => {
    expect([0.5, 1, 1.5, 5.5, 10].map(cutoffMinutesText)).toEqual(['½ min', '1 min', '1½ min', '5½ min', '10 min']);
    expect([1.5, 2, 2.25].map(cutoffFactorText)).toEqual(['1½×', '2×', '2.25×']);
  });
});
