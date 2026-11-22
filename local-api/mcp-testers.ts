/**
 * Local only: the hosted MCP pilot's testers and their calls, for the MCP page's Testers section. Asks the pilot Worker's
 * admin API with the admin token from its credentials file on this Mac (~/Developer/Credentials/Atlas Studio MCP admin for
 * Atlas.env, ADMIN_TOKEN only). Reads only: the list (GET /admin/testers) and one tester's log (GET .../log). Without the
 * token it answers `available: false`. The token never leaves this process.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MCP_PILOT_ORIGIN, MCP_TESTER_CALLS_SHOWN } from '../shared/mcpTesters.js';

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

export default {
  async fetch(request: Request): Promise<Response> {
    const token = adminToken();
    if (!token) return json({ available: false });
    const name = new URL(request.url).searchParams.get('name');
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
