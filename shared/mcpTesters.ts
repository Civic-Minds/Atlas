/** The hosted MCP pilot (workers/atlas-mcp, wrangler.pilot-test.jsonc) and the MCP page's Testers section. */
export const MCP_PILOT_ORIGIN = 'https://atlas-studio-mcp.rhanna-334.workers.dev';
export const MCP_TESTERS_API_URL = '/api/mcp-testers';
/**
 * CIV-2202: the header the MCP page sends when it makes or stops a tester's link. A page on another site can't send it
 * without a CORS preflight, which the local API server doesn't allow for it.
 */
export const MCP_TESTERS_CHANGE_HEADER = 'x-atlas-mcp-page';
/** How many of a tester's most recent calls the page shows. */
export const MCP_TESTER_CALLS_SHOWN = 50;

export interface McpTester { name: string; created_at: string; revoked_at: string | null; calls: number; /** Calls in the last 7 days (CIV-2063); missing from a server deployed before it. */ calls_7d?: number; /** Distinct question IDs, all time and in the last 7 days; missing from a server deployed before them. */ questions?: number; questions_7d?: number }
export interface McpTesterCall { id: number; at: string; tool: string; question: string | null; question_id?: string | null; ok: number; ms: number }

/** The MCP page's usage chart: days shown, ending today (UTC). */
export const MCP_USAGE_DAYS = 28;
/** The most calls per tester the page reads when the server has no daily count yet (the log endpoint's limit). */
export const MCP_USAGE_LOG_LIMIT = 500;
/** One day's use of the hosted pilot, every tester together; `date` is "2026-11-22" (UTC). */
export interface McpUsageDay { date: string; calls: number; questions: number }
/**
 * `complete` is false when the days were added up from the testers' call logs (a server without GET /admin/usage) and a
 * log reached MCP_USAGE_LOG_LIMIT, so its oldest calls are missing.
 */
export type McpUsageResponse = { available: true; days: McpUsageDay[]; complete: boolean } | { available: false };

/**
 * Calls and questions per day from call log rows, for a server without the daily count: the same rule as the server's
 * (a question is a non-blank question ID on one day). Days with no calls between the first and last are filled with 0.
 */
export function usageFromCalls(calls: ReadonlyArray<Pick<McpTesterCall, 'at' | 'question_id'>>): McpUsageDay[] {
  const byDay = new Map<string, { calls: number; ids: Set<string> }>();
  for (const c of calls) {
    const date = c.at.slice(0, 10);
    const day = byDay.get(date) ?? { calls: 0, ids: new Set<string>() };
    day.calls++;
    const id = c.question_id?.trim();
    if (id) day.ids.add(id);
    byDay.set(date, day);
  }
  return fillDays([...byDay].map(([date, d]) => ({ date, calls: d.calls, questions: d.ids.size })));
}

/**
 * Days in date order, every day from `from` to `to` ("2026-11-22"; by default the first and last given), a missing one
 * as 0; days outside the bounds are left out.
 */
export function fillDays(days: readonly McpUsageDay[], from?: string, to?: string): McpUsageDay[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = from ?? sorted[0]?.date, last = to ?? sorted[sorted.length - 1]?.date;
  if (!first || !last) return [];
  const got = new Map(sorted.map(d => [d.date, d]));
  const out: McpUsageDay[] = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(got.get(date) ?? { date, calls: 0, questions: 0 });
  }
  return out;
}

