import { describe, expect, it } from 'vitest';
import { shouldClearStaged } from '../refreshMeta.js';

describe('shouldClearStaged', () => {
  it('clears only once data was processed and published', () => {
    expect(shouldClearStaged({ processed: true })).toBe(true);
  });
  it('keeps staged for stale, unchanged and refused results', () => {
    expect(shouldClearStaged({ stale: true } as { processed?: boolean })).toBe(false);
    expect(shouldClearStaged({})).toBe(false);
    expect(shouldClearStaged({ refused: true } as { processed?: boolean })).toBe(false);
  });
});
