/**
 * Local only: the hosted MCP pilot's testers and their calls, for the MCP page's Testers section. Asks the pilot Worker's
 * admin API with the admin token from its credentials file on this Mac (~/Developer/Credentials/Atlas Studio MCP admin for
 * Atlas.env, ADMIN_TOKEN only). Reads the list (GET /admin/testers) and one tester's log (GET .../log). CIV-2202 (Ryan,
 * 2026-11-24): also makes a tester's link (POST ?make=<name> → POST /admin/testers) and stops one (POST ?stop=<name> →
 * POST /admin/testers/<name>/revoke). The new link goes back to the page once and is never logged or kept here. Without
 * the token it answers `available: false`. The token never leaves this process.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fillDays, MCP_PILOT_ORIGIN, MCP_TESTERS_CHANGE_HEADER, MCP_TESTER_CALLS_SHOWN, MCP_USAGE_DAYS, MCP_USAGE_LOG_LIMIT, usageFromCalls, type McpTester, type McpTesterCall, type McpUsageDay, type McpUsageResponse } from '../shared/mcpTesters.js';

const TOKEN_FILE = join(homedir(), 'Developer/Credentials/Atlas Studio MCP admin for Atlas.env');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function adminToken(): string | null {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  if (!existsSync(TOKEN_FILE)) return null;
  const m = readFileSync(TOKEN_FILE, 'utf8').match(/^\s*(?:export\s+)?ADMIN_TOKEN\s*=\s*['"]?([^'"\s]+)/m);
  return m?.[1] ?? null;
}

/**
 * Calls and questions per day for the MCP page's usage chart. Asks the server's daily count (GET /admin/usage); a server
 * deployed before it answers 404, and then the days are added up from every tester's call log (up to
 * MCP_USAGE_LOG_LIMIT calls each, so a busier log is missing its oldest calls and the answer says it isn't complete).
 */
export async function usage(get: (path: string) => Promise<Response>, today: Date = new Date()): Promise<McpUsageResponse> {
  // Every day of the chart, from MCP_USAGE_DAYS - 1 days ago to today (UTC), a day with no calls as 0.
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const since = new Date(midnight - (MCP_USAGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const until = new Date(midnight).toISOString().slice(0, 10);
  const daily = await get('/admin/usage');
  if (daily.ok) return { available: true, days: fillDays((await daily.json() as { days: McpUsageDay[] }).days, since, until), complete: true };
  if (daily.status !== 404) return { available: false };
  const list = await get('/admin/testers');
  if (!list.ok) return { available: false };
  const { testers } = await list.json() as { testers: McpTester[] };
  const logs = await Promise.all(testers.map(async t => {
    const res = await get(`/admin/testers/${encodeURIComponent(t.name)}/log?limit=${MCP_USAGE_LOG_LIMIT}`);
    return res.ok ? ((await res.json()) as { calls: McpTesterCall[] }).calls : null;
  }));
  if (logs.some(l => l == null)) return { available: false };
  const days = fillDays(usageFromCalls(logs.flatMap(l => l!)), since, until);
  return { available: true, days, complete: logs.every(l => l!.length < MCP_USAGE_LOG_LIMIT) };
}

/**
 * Makes or stops a tester's link (CIV-2202). Only a POST from the MCP page itself: it must carry MCP_TESTERS_CHANGE_HEADER
 * and, when the browser names an origin, a localhost one, so another site open in the browser can't make a link and read it.
 */
export async function change(request: Request, post: (path: string, body?: unknown) => Promise<Response>): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.headers.get(MCP_TESTERS_CHANGE_HEADER) !== '1' || (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return json({ error: 'Refused' }, 403);
  const params = new URL(request.url).searchParams;
  const make = params.get('make'), stop = params.get('stop');
  const res = make != null ? await post('/admin/testers', { name: make }) : stop ? await post(`/admin/testers/${encodeURIComponent(stop)}/revoke`) : null;
  if (!res) return json({ error: 'Not found' }, 404);
  const body = await res.json().catch(() => ({})) as { name?: string; link?: string; revoked?: boolean; error?: string };
  if (!res.ok) return json({ error: body.error ?? null }, res.status);
  return json(make != null ? { name: body.name, link: body.link } : { revoked: body.revoked === true });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const token = adminToken();
    if (!token) return json({ available: false });
    if (request.method === 'POST') {
      const post = (path: string, body?: unknown) => fetch(`${MCP_PILOT_ORIGIN}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      try { return await change(request, post); } catch { return json({ error: null }, 502); }
    }
    const params = new URL(request.url).searchParams;
    if (params.has('usage')) {
      const get = (path: string) => fetch(`${MCP_PILOT_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      try { return json(await usage(get)); } catch { return json({ available: false }); }
    }
    const name = params.get('name');
    const path = name ? `/admin/testers/${encodeURIComponent(name)}/log?limit=${MCP_TESTER_CALLS_SHOWN}` : '/admin/testers';
    try {
      const res = await fetch(`${MCP_PILOT_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return json({ available: false, status: res.status });
      return json({ available: true, ...(await res.json() as object) });
    } catch {
      return json({ available: false });
    }
  },
};
