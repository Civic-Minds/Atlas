/**
 * CIV-1650: a private, local, read-only MCP server for Atlas (Ryan's "1", 2026-11-17). It runs on this Mac over stdio
 * and answers planner questions from Atlas's processed per-agency route files (scripts/mcp/atlasData.ts), with the
 * map's own numbers. Nothing is fetched, uploaded or written; it is not deployed anywhere.
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
const { diskStore } = await import('./diskStore');
// ATLAS_MCP_STORE=split:<folder> reads the split release files in a folder (what the hosted server reads), else the files on this Mac.
const splitDir = process.env.ATLAS_MCP_STORE?.startsWith('split:') ? process.env.ATLAS_MCP_STORE.slice(6) : null;
const { folderReader } = await import('./folderReader');
if (splitDir) {
  const { splitStore } = await import('../../shared/mcpSplitStore');
  data.useStore(splitStore(folderReader(splitDir)));
} else data.useStore(diskStore());
// CIV-2014: say so on every answer when the release cache is older than the newest release (#1643).
const staleNote = splitDir ? null : (await import('./diskStore')).staleCacheNote();
if (staleNote) console.error(`${staleNote} Refresh the cache with scripts/build-agency-page-summaries.ts (it also rewrites shared/data/agency-pages.json: restore that file afterwards).`);
// Testing only (CIV-1860): ATLAS_MCP_LIVE_DIR points the Live tools at a folder laid out like the private Live bucket
// (scripts/mcp/releaseLivePrivate.ts --dry-run writes one under <work>/dry-run).
const liveDir = process.env.ATLAS_MCP_LIVE_DIR;
if (liveDir) {
  const { splitLiveReader, useLiveReader } = await import('./liveData');
  useLiveReader(splitLiveReader(folderReader(liveDir)));
}

const { localHandlers } = await import('./localTools');
// route_now (CIV-1870) reads the Live recorder's snapshots: local only for now.
const { liveNowHandlers } = await import('./liveNowTools');
const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = { ...tools.handlers, ...localHandlers, ...liveNowHandlers };
// Every tool's definition, the local ones included.
const TOOLS = tools.TOOLS;

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
    const result = toolCallResult(await runTool(handler, params?.arguments ?? {}));
    if (staleNote) result.content.push({ type: 'text', text: staleNote });
    reply(id, result);
  } else fail(id, -32601, `Method not found: ${method}`);
}
