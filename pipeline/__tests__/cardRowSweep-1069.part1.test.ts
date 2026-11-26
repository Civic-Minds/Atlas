/**
 * CIV-1069's card-row sweep, part 1 of 4 (CIV-3020): the rules and the sweep are in ./cardRowSweep.ts. Each fixture
 * is its own test and snapshot; a new case changes that fixture's snapshot.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixtureShard, sweepFixture } from './cardRowSweep.js';

describe('card rows read their value, gap and words from the same trips (CIV-1069), part 1 of 4', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterAll(() => { vi.useRealTimers(); });

  it.each(fixtureShard(0, 4))('%s: no number from fewer than 3 own departures, and no plain number beside a gap of half the period or more', async name => {
    expect(await sweepFixture(name)).toMatchSnapshot();
  }, 120_000);
});
