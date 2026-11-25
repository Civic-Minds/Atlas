/**
 * Local only (CIV-1893): Studio's "right now" view of a route, answered by the same code as the MCP's route_now
 * (scripts/mcp/liveNowTools.ts: liveNowHandlers.route_now, over shared/liveNow.ts), so the two never disagree.
 * It reads the Live recorder's last half hour with the MCP's read-only token, loaded the way the MCP loads it
 * (scripts/mcp/liveNowData.ts readTokenEnv: the environment, else the credentials file; never the write keys, never
 * logged), so any restart works. Without the token it answers `available: false`.
 */
import { liveNowHandlers } from '../scripts/mcp/liveNowTools.js';
import { nowSource } from '../scripts/mcp/liveNowData.js';
import * as data from '../scripts/mcp/currentRelease.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** The current release (scripts/mcp/currentRelease.ts), the hosted MCP's store: never files on this Mac (CIV-2914). */
async function connect(): Promise<boolean> {
  if (!nowSource()) return false;
  await data.useCurrentRelease();
  return true;
}

async function handler(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const agency = q.get('agency'), route = q.get('route');
  if (!agency || !route) return json({ error: 'agency and route are required' }, 400);
  try {
    if (!(await connect())) return json({ available: false });
    return json({ available: true, answer: await liveNowHandlers.route_now({ agency, route }) });
  } catch (e) {
    // The detail stays in this server's log; the page gets a fixed message (code scanning alert #55).
    console.error('[route-now]', e);
    return json({ available: true, error: 'route_now failed' });
  }
}

export default { fetch: handler };
