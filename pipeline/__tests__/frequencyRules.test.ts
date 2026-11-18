import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA } from '../defaults';
import { EDGE_GAP_ALLOWANCE_MINUTES as PIPELINE_EDGE, GRACE_FLOOR_MIN_GAPS as PIPELINE_FLOOR } from '../transit-phase2';
import { EDGE_GAP_ALLOWANCE_MINUTES, GRACE_FLOOR_MIN_GAPS, GRACE_MINUTES, GRACE_PERCENT, nearMissGrace, TIER_MAXES, VIOLATION_PERCENT, VIOLATION_PERCENT_BY_TIER } from '../../shared/frequencyRules';

// CIV-1612 (kept under pipeline/: a shared/ file, tests too, may not import pipeline code, or the Vercel build pulls it in): the pipeline grades with these settings and the Docs page states them; one source, so they can't differ.
describe('near-miss settings', () => {
  it('are the ones the pipeline grades with', () => {
    expect(DEFAULT_CRITERIA.graceMinutes).toBe(GRACE_MINUTES);
    expect(DEFAULT_CRITERIA.gracePercent).toBe(GRACE_PERCENT);
    expect(DEFAULT_CRITERIA.violationPercent).toBe(VIOLATION_PERCENT);
    expect(DEFAULT_CRITERIA.violationPercentByTier).toEqual(VIOLATION_PERCENT_BY_TIER);
    expect([PIPELINE_EDGE, PIPELINE_FLOOR]).toEqual([EDGE_GAP_ALLOWANCE_MINUTES, GRACE_FLOOR_MIN_GAPS]);
  });

  // CIV-1813 (Ryan: "why there are any separate frequency bands between modes"): every day grades every mode on the one scale.
  it('grade every mode on the one scale, with no per-mode override', () => {
    for (const [day, cfg] of Object.entries(DEFAULT_CRITERIA.dayTypes)) expect(cfg.tiers, day).toEqual(TIER_MAXES);
    expect(DEFAULT_CRITERIA).not.toHaveProperty('modeTierOverrides');
  });

  it('give the limits FREQUENCY_RULES.md states', () => {
    expect([10, 15, 20, 30, 60].map(t => t + nearMissGrace(t))).toEqual([15, 20, 25, 35, 69]);
  });
});
