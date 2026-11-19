import { describe, expect, it } from 'vitest';
import { historyNow, isDoubtfulHistoryFigure } from '../mcp/atlasData';

describe("route_history's doubtful figures (#1619)", () => {
  // Kingston 501: History's newest snapshot (Jul 2026) runs midday every 15; today's schedule every 30.
  const newest = (k: string) => ({ amPeak: 15, midday: 15, pmPeak: 12, evening: 30 } as Record<string, number>)[k] ?? null;
  it("judges an old 'every 3 min' against today's schedule when the answer shows it", () => {
    const now = historyNow({ amPeak: 24, midday: 30, pmPeak: 24, evening: 30 }, newest);
    expect(isDoubtfulHistoryFigure(3, now('midday'))).toBe(true);
    expect(isDoubtfulHistoryFigure(2, now('pmPeak'))).toBe(false);
  });
  it("falls back to History's newest snapshot, and to the best figure in a part of the day with none", () => {
    const now = historyNow(null, newest);
    expect(isDoubtfulHistoryFigure(3, now('midday'))).toBe(false);
    expect(historyNow({ midday: 30 }, newest)('lateNight' as never)).toBe(30);
  });
});
