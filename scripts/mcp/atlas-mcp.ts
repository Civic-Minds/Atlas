/**
 * CIV-1650: a private, local, read-only MCP server for Atlas (Ryan's "1", 2026-11-17). It runs on this Mac over stdio
 * and answers planner questions from Atlas's processed per-agency route files (scripts/mcp/atlasData.ts), with the
 * map's own numbers. It reads published data from the cloud, the release the map reads (CIV-2014: scripts/mcp/cloudStore.ts),
 * and this Mac only for unpublished files. Nothing is uploaded or written; it is not deployed anywhere.
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
const { splitStore, urlReader } = await import('../../shared/mcpSplitStore');
// CIV-2014: published data from the cloud (the release the map reads), this Mac only for unpublished files. The pointer is
// re-read at most once a minute, so a release published while the server runs is picked up. ATLAS_MCP_DATA_DIR (a folder
// of route files) and split:<folder> keep reading disk, for tests and the MCP chat's runs.
const { MCP_POINTER_RECHECK_MS: POINTER_RECHECK_MS } = await import('../../shared/rules/limits');
const POINTER_TIMEOUT_MS = 5_000;
let cloud: { releaseId: string | null; checkedAt: number } | null = null;
/** The note answers carry while the cloud can't be reached and the copy on this Mac is older than the latest release. */
let staleNote: string | null = null;
async function useCurrentData(): Promise<void> {
  if (splitDir || process.env.ATLAS_MCP_DATA_DIR) return;
  const now = Date.now();
  if (cloud && now - cloud.checkedAt < POINTER_RECHECK_MS) return;
  const { checkMcpRelease } = await import('../../shared/mcpRelease');
  const { R2_PUBLIC_URL } = await import('../../shared/config');
  const { cloudFirstStore } = await import('./cloudStore');
  const readThisMac = async (why: string) => {
    if (cloud?.releaseId !== null) {
      data.useStore(diskStore());
      staleNote = (await import('./diskStore')).staleCacheNote();
      console.error(`Atlas Studio MCP: ${why}; reading the copy on this Mac.`);
    }
    cloud = { releaseId: null, checkedAt: now };
  };
  let check;
  try { check = await checkMcpRelease(R2_PUBLIC_URL, { signal: AbortSignal.timeout(POINTER_TIMEOUT_MS) }); }
  catch (e) { return readThisMac(`the cloud release could not be read (${(e as Error).message})`); }
  if (check.kind === 'ready') {
    if (check.releaseId !== cloud?.releaseId) {
      data.useStore(cloudFirstStore(splitStore(urlReader(check.base)), diskStore({ releaseCache: false })));
      staleNote = null;
    }
    cloud = { releaseId: check.releaseId, checkedAt: now };
  } else if (cloud?.releaseId) {
    // The pointer moved before the new release's MCP files were up: the release loaded keeps answering (as the hosted server does).
    cloud = { ...cloud, checkedAt: now };
  } else await readThisMac(`release ${check.releaseId} has no MCP files yet`);
}
if (splitDir) data.useStore(splitStore(folderReader(splitDir)));
else if (process.env.ATLAS_MCP_DATA_DIR) data.useStore(diskStore());
else await useCurrentData();
// Testing only (CIV-1860): ATLAS_MCP_LIVE_DIR points the Live tools at a folder laid out like the private Live bucket
// (scripts/mcp/releaseLivePrivate.ts --dry-run writes one under <work>/dry-run).
const liveDir = process.env.ATLAS_MCP_LIVE_DIR;
if (liveDir) {
  const { splitLiveReader, useLiveReader } = await import('./liveData');
  useLiveReader(splitLiveReader(folderReader(liveDir)));
}

const { localHandlers } = await import('./localTools');
// route_now (CIV-1870) reads the Live recorder's snapshots (the hosted server adds it too).
const { liveNowHandlers } = await import('./liveNowTools');
const { onDemandHandlers, useOnDemandBase } = await import('./onDemandTools');
// ATLAS_ON_DEMAND_BASE: read the on-demand zones from another bucket (ATLAS_ON_DEMAND_BETA=0: promoted services only).
if (process.env.ATLAS_ON_DEMAND_BASE) useOnDemandBase(process.env.ATLAS_ON_DEMAND_BASE, process.env.ATLAS_ON_DEMAND_BETA !== '0');
const { nightHandlers } = await import('./nightTools');
const { coverageHandlers } = await import('./coverageTools');
const { withScheduleWarning } = await import('./toolHelpers');
const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = withScheduleWarning({ ...tools.handlers, ...localHandlers, ...liveNowHandlers, ...onDemandHandlers, ...nightHandlers, ...coverageHandlers });
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
    await useCurrentData();
    const result = toolCallResult(await runTool(handler, params?.arguments ?? {}));
    if (staleNote) result.content.push({ type: 'text', text: staleNote });
    reply(id, result);
  } else fail(id, -32601, `Method not found: ${method}`);
}
