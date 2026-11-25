/**
 * CIV-1650: a private, local, read-only MCP server for Atlas (Ryan's "1", 2026-11-17). It runs on this Mac over stdio
 * and answers planner questions from Atlas's processed per-agency route files (scripts/mcp/atlasData.ts), with the
 * map's own numbers. It reads only what the hosted server reads (CIV-2914), from the cloud. Nothing is uploaded or
 * written; it is not deployed anywhere: it is atlas-studio-dev, for testing MCP code before it deploys.
 *
 * Setup for Claude Code and Claude Desktop: scripts/mcp/README.md.
 *
 * Speaks MCP's stdio transport directly (newline-delimited JSON-RPC 2.0: initialize, tools/list, tools/call, ping),
 * so it adds no dependency. Logs go to stderr; stdout carries only protocol messages.
 */
import { createInterface } from 'node:readline';
import { initializeResult, runTool, toolCallResult } from './rpc';

// Anything an imported module prints must not reach stdout, which is the protocol channel.
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');
const tools = await import('./tools');
const { INSTRUCTIONS } = tools;
type Args = Record<string, unknown>;
// CIV-2914: atlas-studio-dev exists only to test MCP code before it deploys, so it reads what the hosted server reads
// (workers/atlas-mcp): the current release's split files, the private Live bucket, the recorder. Never a copy on this Mac.
// Opt-in test folders only: ATLAS_MCP_STORE=split:<folder> (split release files), ATLAS_MCP_DATA_DIR (route files).
const splitDir = process.env.ATLAS_MCP_STORE?.startsWith('split:') ? process.env.ATLAS_MCP_STORE.slice(6) : null;
const { folderReader } = await import('./folderReader');
const { splitStore } = await import('../../shared/mcpSplitStore');
const { useCurrentRelease } = await import('./currentRelease');
const useCurrentData = async () => { if (!splitDir && !process.env.ATLAS_MCP_DATA_DIR) await useCurrentRelease(); };
if (splitDir) data.useStore(splitStore(folderReader(splitDir)));
else if (process.env.ATLAS_MCP_DATA_DIR) data.useStore((await import('./diskStore')).diskStore());
else await useCurrentData().catch(e => console.error(`Atlas Studio MCP: ${(e as Error).message}`));
// The Live tools read the private Live bucket, as the hosted server does (its MCP_LIVE binding), with the read-only keys.
{
  const { splitLiveReader, useLiveReader } = await import('./liveData');
  if (process.env.ATLAS_MCP_LIVE_DIR) useLiveReader(splitLiveReader(folderReader(process.env.ATLAS_MCP_LIVE_DIR)));
  else {
    const { privateBucket } = await import('../../local-api/privateBucket');
    const LIVE_TTL_MS = 5 * 60_000;
    const liveCache = new Map<string, { at: number; value: unknown }>();
    useLiveReader(splitLiveReader(async key => {
      const hit = liveCache.get(key);
      if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
      const text = await privateBucket().get(key);
      const value = text == null ? null : JSON.parse(text);
      liveCache.set(key, { at: Date.now(), value });
      return value;
    }));
  }
}
// trip_time, combined_frequency and stop_frequency's every-route reading need schedule zips, which the hosted server
// doesn't have: only with the opt-in test folder ATLAS_MCP_FEEDS_DIR (CIV-2914).
const localHandlers = process.env.ATLAS_MCP_FEEDS_DIR ? (await import('./localTools')).localHandlers : {};
// route_now (CIV-1870) reads the Live recorder's snapshots (the hosted server adds it too).
const { liveNowHandlers } = await import('./liveNowTools');
const { onDemandHandlers, useOnDemandBase } = await import('./onDemandTools');
// ATLAS_ON_DEMAND_BASE: read the on-demand zones from another bucket (ATLAS_ON_DEMAND_BETA=0: promoted services only).
if (process.env.ATLAS_ON_DEMAND_BASE) useOnDemandBase(process.env.ATLAS_ON_DEMAND_BASE, process.env.ATLAS_ON_DEMAND_BETA !== '0');
const { nightHandlers } = await import('./nightTools');
const { coverageHandlers } = await import('./coverageTools');
const { withScheduleWarning } = await import('./toolHelpers');
const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = withScheduleWarning({ ...tools.handlers, ...localHandlers, ...liveNowHandlers, ...onDemandHandlers, ...nightHandlers, ...coverageHandlers });
// The tools this server answers, as the hosted server lists them.
const TOOLS = tools.TOOLS.filter(t => t.name in handlers);

function reply(id: unknown, result: unknown) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id: unknown, code: number, message: string) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Args; protocolVersion?: string } };
  try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); continue; }
  const { id, method, params } = msg;
  if (id === undefined) continue; // notifications (initialized, cancelled) need no answer
  if (method === 'initialize') reply(id, initializeResult(params?.protocolVersion, tools.SERVER_VERSION, INSTRUCTIONS));
  else if (method === 'ping') reply(id, {});
  else if (method === 'tools/list') reply(id, { tools: TOOLS });
  else if (method === 'tools/call') {
    const handler = handlers[params?.name ?? ''];
    if (!handler) { fail(id, -32602, `Unknown tool ${params?.name}`); continue; }
    try { await useCurrentData(); } catch (e) { reply(id, toolCallResult(await runTool(() => { throw e; }, {}))); continue; }
    const result = toolCallResult(await runTool(handler, params?.arguments ?? {}));
    reply(id, result);
  } else fail(id, -32601, `Method not found: ${method}`);
}
