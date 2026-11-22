import { MCP_CALL_LOG_RETENTION_MONTHS } from '../../../shared/rules/limits';

/**
 * #1691: the call log keeps MCP_CALL_LOG_RETENTION_MONTHS (12), then the daily cron deletes older calls. Calls are
 * stamped with ISO times (`at`), so a string comparison against the cutoff's ISO time finds them.
 */
export function callLogCutoff(now: Date, months = MCP_CALL_LOG_RETENTION_MONTHS): string {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  // Keep the day where the month has it; Feb 29 or a 31st falls to that month's last day.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** Deletes calls older than the retention period; returns how many went. */
export async function deleteOldCalls(db: D1Database, now: Date): Promise<number> {
  const res = await db.prepare('DELETE FROM calls WHERE at < ?').bind(callLogCutoff(now)).run();
  return res.meta.changes ?? 0;
}
