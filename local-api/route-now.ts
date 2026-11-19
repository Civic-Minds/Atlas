/**
 * Local only (CIV-1893): Studio's "right now" view of a route, answered by the same code as the MCP's route_now
 * (scripts/mcp/liveNowTools.ts: liveNowHandlers.route_now, over shared/liveNow.ts), so the two never disagree.
 * It reads the Live recorder's last half hour with the MCP's read-only token, loaded the way the MCP loads it
 * (scripts/mcp/liveNowData.ts readTokenEnv: the environment, else the credentials file; never the write keys, never
 * logged), so any restart works. Without the token it answers `available: false`.
 */
import { liveNowHandlers } from '../scripts/mcp/liveNowTools.js';
import { nowSource } from '../scripts/mcp/liveNowData.js';
import { mainCheckoutRoot } from './mcp-coverage.js';
import * as data from '../scripts/mcp/atlasData.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

let ready = false;
/** The files the MCP answers from on this Mac, loaded once from the main checkout (a worktree has no tmp/ data of its own). */
async function connect(): Promise<boolean> {
  if (!nowSource()) return false;
  if (!ready) {
    const root = mainCheckoutRoot();
    if (root && !process.env.ATLAS_ROOT) process.env.ATLAS_ROOT = root; // read when diskStore loads, so set first
    data.useStore((await import('../scripts/mcp/diskStore.js')).diskStore());
    ready = true;
  }
  return true;
}

async function handler(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const agency = q.get('agency'), route = q.get('route');
  if (!agency || !route) return json({ error: 'agency and route are required' }, 400);
  if (!(await connect())) return json({ available: false });
  try {
    return json({ available: true, answer: await liveNowHandlers.route_now({ agency, route }) });
  } catch (e) {
    return json({ available: true, error: e instanceof Error ? e.message : String(e) });
  }
}

export default { fetch: handler };
