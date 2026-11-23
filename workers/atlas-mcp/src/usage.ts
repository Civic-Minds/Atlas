import { MCP_USAGE_DAYS, type McpUsageDay } from '../../../shared/mcpTesters';

/**
 * The MCP page's usage chart (Ryan, 2026-11-22: "The MCP page could also have a chart for the usage at the bottom",
 * then "Do both"): calls and questions per day (UTC dates), every tester together. A question is a question ID on one
 * day (#1709), so counting distinct IDs within each day matches the testers list; a blank ID is no question (#1706).
 */
export const USAGE_SQL = "SELECT substr(at, 1, 10) AS date, COUNT(*) AS calls, COUNT(DISTINCT NULLIF(TRIM(question_id), '')) AS questions FROM calls WHERE at >= ? GROUP BY date ORDER BY date";

/** The first moment counted: midnight UTC, `days` - 1 days before today, so today is the last of `days` days. */
export function usageSince(now: Date, days: number = MCP_USAGE_DAYS): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

export async function usageByDay(db: D1Database, now: Date = new Date(), days: number = MCP_USAGE_DAYS): Promise<McpUsageDay[]> {
  const rows = await db.prepare(USAGE_SQL).bind(usageSince(now, days)).all<McpUsageDay>();
  return rows.results.map(r => ({ date: r.date, calls: Number(r.calls), questions: Number(r.questions) }));
}
