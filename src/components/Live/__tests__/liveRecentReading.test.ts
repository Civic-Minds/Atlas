import { describe, expect, it } from 'vitest';
import { recentReading } from '../LiveRoutePerformance';
import { LIVE_STALE_SEC } from '../../../../shared/rules/live';

/**
 * CIV-3173 part 2 (one feed, one clock), and its critic (2026-11-28): the map and Studio measure the same recordings, but a
 * card must never read emptier than before part 2. When the recordings lag, or the card's first answer is old, it measures
 * the recordings up to its first poll, then its polls, as before.
 */
describe('recentReading', () => {
  const T = 1_800_000_000;
  const snap = (t: number) => ({ capturedAt: t, v: [['a', 't1', 43.65, -79.4, t] as [string, string, number, number, number]] });
  const recorded = [snap(T - 120), snap(T - 60)];
  const polls = [snap(T - 10), snap(T + 5)];

  it('fresh recordings: they alone, on the newest recording\'s time', () => {
    const r = recentReading({ snapshots: recorded, serverNow: T, fetchedAt: T * 1000 }, polls, T + 5);
    expect(r.recent).toBe(recorded);
    expect(r.clockSec).toBe(T - 60);
  });

  it('recordings behind by more than LIVE_STALE_SEC: the recordings up to the first poll, then the polls, on the browser\'s clock', () => {
    const r = recentReading({ snapshots: recorded, serverNow: T - 60 + LIVE_STALE_SEC + 1, fetchedAt: T * 1000 }, polls, T + 5);
    expect(r.recent.map(s => s.capturedAt)).toEqual([T - 120, T - 60, T - 10, T + 5]);
    expect(r.clockSec).toBeNull();
  });

  it('an answer older than LIVE_STALE_SEC: the same fallback', () => {
    const r = recentReading({ snapshots: recorded, serverNow: T, fetchedAt: T * 1000 }, polls, T + LIVE_STALE_SEC + 1);
    expect(r.clockSec).toBeNull();
    expect(r.recent.at(-1)?.capturedAt).toBe(T + 5);
  });

  it('no recordings: the polls', () => {
    expect(recentReading(null, polls, T)).toEqual({ recent: polls, clockSec: null });
  });
});

describe('the card never reads emptier than a page\'s own reading (CIV-3173 part 2 critic)', () => {
  it('fills a row the shared reading leaves blank from the page\'s own reading, and keeps the shared figure elsewhere', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../LiveRoutePerformance.tsx', import.meta.url), 'utf8');
    // The rows are worked out over the shared reading first; only blank rows take the page's own (ownRecent, ownNow).
    expect(src).toMatch(/const first = rowsOf\(shared, recent, now\)/);
    expect(src).toMatch(/if \(!first\.get\(k\)\?\.extremes && f\.extremes\) first\.set\(k, f\)/);
    expect(src).toMatch(/ownRecent=\{ownRecent\}/);
  });
});
