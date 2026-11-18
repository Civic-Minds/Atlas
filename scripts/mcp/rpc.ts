/**
 * The MCP protocol answers both servers give (CIV-1864): the local stdio server (atlas-mcp.ts) and the hosted Worker
 * (workers/atlas-mcp) build initialize, tools/list and tools/call results here, so they can't drift apart. Each server
 * keeps only its own transport, and the hosted one its limits and call log.
 */

/** The MCP protocol versions the servers answer to, newest first; a client asking for another gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export const SERVER_NAME = 'atlas-studio';
export const SERVER_TITLE = 'Atlas Studio';

/** The answer to initialize, for the version the client asked for. */
export function initializeResult(requested: string | undefined, version: string, instructions: string) {
  const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(requested ?? '') ? requested! : PROTOCOL_VERSIONS[0];
  return { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, title: SERVER_TITLE, version }, instructions };
}

/** A tool's answer as MCP text content. */
export function toolText(value: unknown): string {
  return JSON.stringify(value, null, 1);
}

export interface ToolCallOutcome { ok: boolean; text: string }

/** Runs a tool and gives its text, or its error's message as the text (an error the assistant can tell the person). */
export async function runTool(handler: (args: Record<string, unknown>) => unknown | Promise<unknown>, args: Record<string, unknown>): Promise<ToolCallOutcome> {
  try {
    return { ok: true, text: toolText(await handler(args)) };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}

/** The tools/call result for an outcome. */
export function toolCallResult(o: ToolCallOutcome) {
  return { content: [{ type: 'text', text: o.text }], ...(o.ok ? {} : { isError: true }) };
}
