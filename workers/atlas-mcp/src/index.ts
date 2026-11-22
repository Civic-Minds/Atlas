/**
 * Atlas Studio MCP, hosted pilot (CIV-1840). A stateless Streamable HTTP MCP endpoint at /t/<token>/mcp serving the
 * published-data tools in scripts/mcp/tools.ts, read-only from the live release, with one private link per tester, a
 * fair-use limit and a log of every call (arguments, the optional question, the answer) that the tester can have deleted.
 *
 * It reads the same split files the local check reads (shared/mcpSplitStore.ts) from `<DATA_ORIGIN>/atlas/releases/<id>/mcp/`,
 * found through the release pointer the map reads, so it is never staler than the map.
 */
import * as data from '../../../scripts/mcp/atlasData';
import { TOOLS, handlers as scheduleHandlers, INSTRUCTIONS, SERVER_VERSION, LIVE_TOOLS } from '../../../scripts/mcp/tools';
import { liveNowHandlers } from '../../../scripts/mcp/liveNowTools';
import { withScheduleWarning } from '../../../scripts/mcp/toolHelpers';
import { onDemandHandlers } from '../../../scripts/mcp/onDemandTools';

/** Every tool the hosted server answers: the shared ones plus route_now (CIV-1870), which the local server also adds. */
const handlers = withScheduleWarning({ ...scheduleHandlers, ...liveNowHandlers, ...onDemandHandlers });
import { linkToken } from './linkToken';
import { jsonOrNull, splitStore, splitUrl, urlReader } from '../../../shared/mcpSplitStore';
import { checkMcpRelease } from '../../../shared/mcpRelease';
import { initializeResult, runTool, toolCallResult } from '../../../scripts/mcp/rpc';
import { splitLiveReader, useLiveReader } from '../../../scripts/mcp/liveData';
import { bucketNowSource, useNowSource } from '../../../scripts/mcp/liveNowData';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOGGED_RESULT = 1_500_000; // D1 rows top out at 2 MB
const POINTER_TTL_SECONDS = 60;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Compares two secrets without leaking where they differ: their SHA-256 digests have equal length, so every byte is always visited. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// The release the tools read now. One per isolate: a new release id swaps the store (and clears its caches).
let activeRelease: { id: string; checkedAt: number } | null = null;

/** Test deployments only (wrangler.pilot-test.jsonc): the split files ship inside the Worker as static assets, for a first test with nothing uploaded to R2. */
type TestEnv = Env & { ASSETS?: Fetcher; DATA_FROM_ASSETS?: string; MCP_LIVE?: R2Bucket; MCP_LIVE_ARCHIVE?: R2Bucket };

/**
 * The Live tools read the private bucket (CIV-1860; scripts/mcp/releaseLivePrivate.ts writes it daily), with a short
 * per-isolate cache so a conversation's calls don't re-read the same few-KB files. Without the binding they read Live's
 * public TTC files instead.
 */
const LIVE_TTL_MS = 5 * 60_000;
let liveBucket: R2Bucket | undefined;
const liveCache = new Map<string, { at: number; value: unknown }>();
let archiveBucket: R2Bucket | undefined;
function useLiveBucket(env: TestEnv): void {
  // route_now (CIV-1870): the recorder's last half hour, from the Live archive bucket, read only.
  if (env.MCP_LIVE_ARCHIVE && env.MCP_LIVE_ARCHIVE !== archiveBucket) { archiveBucket = env.MCP_LIVE_ARCHIVE; useNowSource(bucketNowSource(archiveBucket)); }
  if (!env.MCP_LIVE || env.MCP_LIVE === liveBucket) return;
  liveBucket = env.MCP_LIVE;
  liveCache.clear();
  useLiveReader(splitLiveReader(async key => {
    const hit = liveCache.get(key);
    if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
    const obj = await liveBucket!.get(key);
    const value = obj ? await obj.json() : null;
    liveCache.set(key, { at: Date.now(), value });
    return value;
  }));
}

async function useCurrentRelease(env: TestEnv): Promise<string> {
  if (env.ASSETS && env.DATA_FROM_ASSETS) {
    const assets = env.ASSETS;
    if (activeRelease?.id !== 'bundled') {
      data.useStore(splitStore(async path => jsonOrNull(await assets.fetch(splitUrl('https://assets.invalid', path)), path)));
      activeRelease = { id: 'bundled', checkedAt: Date.now() };
    }
    return 'bundled';
  }
  if (env.MCP_DATA_BASE) {
    // Local testing: a folder served over HTTP stands in for the release.
    if (activeRelease?.id !== 'local') { data.useStore(splitStore(urlReader(env.MCP_DATA_BASE))); activeRelease = { id: 'local', checkedAt: Date.now() }; }
    return 'local';
  }
  const now = Date.now();
  if (activeRelease && now - activeRelease.checkedAt < POINTER_TTL_SECONDS * 1000) return activeRelease.id;
  // shared/mcpRelease.ts: the pointer, then the release's manifest (the same check the local server makes).
  const check = await checkMcpRelease(env.DATA_ORIGIN, { cf: { cacheTtl: POINTER_TTL_SECONDS, cacheEverything: true } });
  if (activeRelease?.id !== check.releaseId) {
    // A new release counts only once its MCP files are up (the pointer can move before they are uploaded): until then the
    // release already loaded keeps answering. With none loaded yet there is nothing to answer from.
    if (check.kind === 'notReady') {
      if (activeRelease) { activeRelease = { ...activeRelease, checkedAt: now }; return activeRelease.id; }
      throw new Error('Atlas Studio has no schedule files for the current release yet. Try again later.');
    }
    // Files of one release never change, so they cache for a long time at the edge.
    data.useStore(splitStore(urlReader(check.base, { cf: { cacheTtl: 86_400, cacheEverything: true } })));
  }
  activeRelease = { id: check.releaseId, checkedAt: now };
  return check.releaseId;
}

/** A tester behind a link, with their calls in the last 24 hours. */
type Tester = { name: string; used: number };

type JsonRpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } };
const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return text.length > MAX_BODY_BYTES ? null : text;
}

async function handleMcp(request: Request, env: TestEnv, ctx: ExecutionContext, tester: Tester): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST for MCP requests.' }, 405, { Allow: 'POST' });
  const text = await readBody(request);
  if (text == null) return rpcError(null, -32600, 'Request too large.', 413);
  let msg: JsonRpc;
  try { msg = JSON.parse(text); } catch { return rpcError(null, -32700, 'Parse error', 400); }
  if (Array.isArray(msg) || typeof msg !== 'object' || msg === null) return rpcError(null, -32600, 'Send one JSON-RPC message per request.', 400);
  const { id, method, params } = msg;
  if (id === undefined) return new Response(null, { status: 202 }); // notifications need no answer
  switch (method) {
    case 'initialize':
      return rpcResult(id, initializeResult(params?.protocolVersion, SERVER_VERSION, INSTRUCTIONS));
    case 'ping': return rpcResult(id, {});
    case 'tools/list': return rpcResult(id, { tools: TOOLS.filter(t => t.name in handlers && served(t.name, env)) });
    case 'tools/call': useLiveBucket(env); return callTool(id, params ?? {}, env, ctx, tester);
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** Live tools show on the hosted server where the LIVE_TOOLS var is "on" (CIV-1860; Ryan, 2026-11-21: "turn on live vehicles for cloud too"). */
const served = (name: string, env: object) => !LIVE_TOOLS.includes(name) || (env as { LIVE_TOOLS?: string }).LIVE_TOOLS === 'on';

async function callTool(id: unknown, params: NonNullable<JsonRpc['params']>, env: TestEnv, ctx: ExecutionContext, tester: Tester): Promise<Response> {
  const name = params.name ?? '';
  const handler = served(name, env) ? handlers[name] : undefined;
  if (!handler) return rpcError(id, -32602, `Unknown tool ${name}`);
  const { success } = await env.TESTER_LIMIT.limit({ key: tester.name });
  // Said as a tool result, not a bare HTTP error, so the assistant can tell the person plainly.
  const limited = (message: string, retryAfter: string) => json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } }, 200, { 'Retry-After': retryAfter });
  if (!success) return limited('Too many requests in a short time. Wait a minute and try again.', '60');
  if (tester.used >= Number(env.DAILY_CALL_CAP)) return limited("You've reached the daily fair-use limit for Atlas Studio (it counts the last 24 hours). Try again later.", '3600');

  const { question, ...args } = params.arguments ?? {};
  const started = Date.now();
  let releaseId: string | null = null;
  const outcome = await runTool(async a => { releaseId = await useCurrentRelease(env); return handler(a); }, args);
  const { ok, text } = outcome;
  const ms = Date.now() - started;
  const logged = text.length > MAX_LOGGED_RESULT ? `${text.slice(0, MAX_LOGGED_RESULT)}\n[cut: the answer was ${text.length} characters]` : text;
  ctx.waitUntil(env.DB.prepare('INSERT INTO calls (at, tester, tool, args, question, ok, result, ms, release_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), tester.name, name, JSON.stringify(args), typeof question === 'string' ? question.slice(0, 2000) : null, ok ? 1 : 0, logged, ms, releaseId).run());
  return rpcResult(id, toolCallResult(outcome));
}

/** The tester behind a link's token, or null (unknown or revoked). */
async function testerFor(token: string, env: Env): Promise<Tester | null> {
  // One round trip: who the link belongs to, and how many calls they made in the last 24 hours (the daily cap reads it).
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const row = await env.DB.prepare('SELECT t.name, (SELECT COUNT(*) FROM calls c WHERE c.tester = t.name AND c.at >= ?) AS used FROM testers t WHERE t.token_hash = ? AND t.revoked_at IS NULL').bind(since, await sha256(token)).first<{ name: string; used: number }>();
  return row ? { name: row.name, used: row.used } : null;
}

async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!env.ADMIN_TOKEN || !(await sameSecret(given, env.ADMIN_TOKEN))) return json({ error: 'Unauthorized' }, 401);
  const parts = url.pathname.split('/').filter(Boolean); // admin, testers, <name>, <what>
  const [, area, rawName, what] = parts;
  const name = rawName ? decodeURIComponent(rawName) : null;
  if (area !== 'testers') return json({ error: 'Not found' }, 404);

  if (!name && request.method === 'GET') {
    // CIV-2063: calls in the last 7 days too, for the internal MCP page.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare('SELECT t.name, t.created_at, t.revoked_at, (SELECT COUNT(*) FROM calls c WHERE c.tester = t.name) AS calls, (SELECT COUNT(*) FROM calls c WHERE c.tester = t.name AND c.at >= ?) AS calls_7d FROM testers t ORDER BY t.created_at').bind(weekAgo).all();
    return json({ testers: rows.results });
  }
  if (!name && request.method === 'POST') {
    const body = await request.json<{ name?: string }>().catch(() => ({} as { name?: string }));
    const who = String(body.name ?? '').trim();
    if (!/^[A-Za-z0-9 ._-]{1,60}$/.test(who)) return json({ error: 'Give a name of up to 60 letters, numbers, spaces, dots, dashes or underscores.' }, 400);
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    try {
      await env.DB.prepare('INSERT INTO testers (name, token_hash, created_at) VALUES (?, ?, ?)').bind(who, await sha256(token), new Date().toISOString()).run();
    } catch { return json({ error: `A tester named "${who}" already exists.` }, 409); }
    // The token is shown once: only its hash is kept.
    return json({ name: who, link: `${url.origin}/t/${token}/mcp`, note: 'Shown once. Revoke with POST /admin/testers/<name>/revoke.' }, 201);
  }
  if (name && what === 'revoke' && request.method === 'POST') {
    const r = await env.DB.prepare('UPDATE testers SET revoked_at = ? WHERE name = ? AND revoked_at IS NULL').bind(new Date().toISOString(), name).run();
    return json({ revoked: r.meta.changes > 0 });
  }
  if (name && what === 'log' && request.method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
    const rows = await env.DB.prepare('SELECT id, at, tool, args, question, ok, result, ms, release_id FROM calls WHERE tester = ? ORDER BY id DESC LIMIT ?').bind(name, limit).all();
    return json({ tester: name, calls: rows.results });
  }
  if (name && what === 'log' && request.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM calls WHERE tester = ?').bind(name).run();
    return json({ tester: name, deletedCalls: r.meta.changes });
  }
  if (name && !what && request.method === 'DELETE') {
    const [calls, tester] = await env.DB.batch([env.DB.prepare('DELETE FROM calls WHERE tester = ?').bind(name), env.DB.prepare('DELETE FROM testers WHERE name = ?').bind(name)]);
    return json({ tester: name, deletedCalls: calls.meta.changes, deletedTester: tester.meta.changes > 0 });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') return json({ ok: true });
      if (url.pathname.startsWith('/admin/')) return await handleAdmin(request, env, url);
      const token = linkToken(request, url);
      if (token !== undefined) {
        const tester = token ? await testerFor(token, env) : null;
        if (!tester) return json({ error: 'This link is not valid.' }, 401);
        return await handleMcp(request, env, ctx, tester);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      // A tester's link holds their token (in the path or the query), so neither is logged.
      console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e), path: url.pathname.replace(/^\/t\/[^/]+/, '/t/…') }));
      return json({ error: 'Something went wrong on our side.' }, 500);
    }
  },
} satisfies ExportedHandler<TestEnv>;
