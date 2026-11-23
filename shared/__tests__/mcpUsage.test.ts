import { describe, expect, it } from 'vitest';
import { fillDays, usageFromCalls } from '../mcpTesters';

// The MCP page's usage chart (Ryan, 2026-11-22: "Do both"): the fallback count from call logs, same rule as the server.
describe('MCP usage per day', () => {
  it('counts calls, and questions as distinct non-blank IDs within each day', () => {
    expect(usageFromCalls([
      { at: '2026-11-20T10:00:00Z', question_id: 'a' },
      { at: '2026-11-20T11:00:00Z', question_id: 'a' },
      { at: '2026-11-20T12:00:00Z', question_id: ' ' },
      { at: '2026-11-22T09:00:00Z', question_id: 'a' },
      { at: '2026-11-22T09:01:00Z', question_id: null },
    ])).toEqual([
      { date: '2026-11-20', calls: 3, questions: 1 },
      { date: '2026-11-21', calls: 0, questions: 0 },
      { date: '2026-11-22', calls: 2, questions: 1 },
    ]);
  });
  it('fills missing days across a month end and sorts', () => {
    expect(fillDays([{ date: '2026-12-01', calls: 1, questions: 1 }, { date: '2026-11-30', calls: 2, questions: 0 }]).map(d => d.date)).toEqual(['2026-11-30', '2026-12-01']);
    expect(fillDays([])).toEqual([]);
  });
});
