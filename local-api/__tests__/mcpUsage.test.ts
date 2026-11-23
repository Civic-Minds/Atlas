import { describe, expect, it } from 'vitest';
import { usage } from '../mcp-testers';
import { MCP_USAGE_LOG_LIMIT } from '../../shared/mcpTesters';

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const today = new Date('2026-11-22T12:00:00Z');

// The MCP page's usage chart: the server's daily count, or the testers' call logs from a server deployed before it.
describe('MCP usage through the local API', () => {
  it('uses the server’s daily count when it has one', async () => {
    const got = await usage(async path => (path === '/admin/usage' ? reply(200, { days: [{ date: '2026-11-20', calls: 3, questions: 1 }, { date: '2026-11-22', calls: 1, questions: 1 }] }) : reply(500)), today);
    if (!got.available) throw new Error('not available');
    expect(got.complete).toBe(true);
    expect(got.days).toHaveLength(28); // Oct 26 to Nov 22, every day
    expect(got.days[0]).toEqual({ date: '2026-10-26', calls: 0, questions: 0 });
    expect(got.days.slice(-3)).toEqual([
      { date: '2026-11-20', calls: 3, questions: 1 }, { date: '2026-11-21', calls: 0, questions: 0 }, { date: '2026-11-22', calls: 1, questions: 1 },
    ]);
  });

  it('adds up the call logs when the server answers 404, and says when a log reached the limit', async () => {
    const full = Array.from({ length: MCP_USAGE_LOG_LIMIT }, () => ({ at: '2026-11-22T10:00:00Z', question_id: 'q' }));
    const get = async (path: string) => {
      if (path === '/admin/usage') return reply(404);
      if (path === '/admin/testers') return reply(200, { testers: [{ name: 'A' }, { name: 'B' }] });
      if (path.startsWith('/admin/testers/A/log')) return reply(200, { calls: [{ at: '2026-11-21T10:00:00Z', question_id: 'x' }, { at: '2026-09-01T10:00:00Z', question_id: 'old' }] });
      return reply(200, { calls: full });
    };
    const got = await usage(get, today);
    if (!got.available) throw new Error('not available');
    expect(got.complete).toBe(false);
    expect(got.days).toHaveLength(28); // the September call falls outside
    expect(got.days.slice(-2)).toEqual([
      { date: '2026-11-21', calls: 1, questions: 1 }, { date: '2026-11-22', calls: MCP_USAGE_LOG_LIMIT, questions: 1 },
    ]);
  });

  it('is not available when the server fails another way', async () => {
    expect(await usage(async () => reply(401), today)).toEqual({ available: false });
  });
});
