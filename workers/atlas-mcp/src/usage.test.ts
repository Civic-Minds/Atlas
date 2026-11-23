import { describe, expect, it, vi } from 'vitest';
import { USAGE_SQL, usageByDay, usageSince } from './usage';

// The MCP page's usage chart (Ryan, 2026-11-22): calls and questions per day, every tester together.
describe('usage per day', () => {
  it('starts at midnight UTC so today is the last of the days', () => {
    expect(usageSince(new Date('2026-11-22T23:59:00Z'), 28)).toBe('2026-10-26T00:00:00.000Z');
    expect(usageSince(new Date('2026-03-01T01:00:00Z'), 2)).toBe('2026-02-28T00:00:00.000Z');
  });
  it('counts a question as a non-blank ID within one day (#1709, #1706)', () => {
    expect(USAGE_SQL).toContain("COUNT(DISTINCT NULLIF(TRIM(question_id), ''))");
    expect(USAGE_SQL).toContain('GROUP BY date');
  });
  it('reads the rows as numbers', async () => {
    const all = vi.fn().mockResolvedValue({ results: [{ date: '2026-11-22', calls: '40', questions: '12' }] });
    const bind = vi.fn().mockReturnValue({ all });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;
    expect(await usageByDay(db, new Date('2026-11-22T12:00:00Z'), 28)).toEqual([{ date: '2026-11-22', calls: 40, questions: 12 }]);
    expect(bind).toHaveBeenCalledWith('2026-10-26T00:00:00.000Z');
  });
});
