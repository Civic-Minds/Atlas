/**
 * Calls a day per tester: DAILY_CALL_CAP for everyone, unless TESTER_DAILY_CAPS (wrangler vars, a tester name → calls
 * object) gives that tester its own. Ryan, via MCP Breaker (2026-11-22): the internal testing link ("MCP check" in the
 * tester table; "Internal Testing" in the credentials file) gets about 2,000 a day; every other tester stays at 300.
 */
export interface CapEnv { DAILY_CALL_CAP: string; TESTER_DAILY_CAPS?: Record<string, number> | string }

export function dailyCapFor(tester: string, env: CapEnv): number {
  const all = Number(env.DAILY_CALL_CAP);
  let own: Record<string, unknown> = {};
  try { own = typeof env.TESTER_DAILY_CAPS === 'string' ? JSON.parse(env.TESTER_DAILY_CAPS) : env.TESTER_DAILY_CAPS ?? {}; } catch { own = {}; }
  const mine = Number(own[tester]);
  return Number.isFinite(mine) && mine > 0 ? mine : all;
}
