/** The hosted MCP pilot (workers/atlas-mcp, wrangler.pilot-test.jsonc) and the MCP page's Testers section. */
export const MCP_PILOT_ORIGIN = 'https://atlas-studio-mcp.rhanna-334.workers.dev';
export const MCP_TESTERS_API_URL = '/api/mcp-testers';
/** How many of a tester's most recent calls the page shows. */
export const MCP_TESTER_CALLS_SHOWN = 50;

export interface McpTester { name: string; created_at: string; revoked_at: string | null; calls: number; /** Calls in the last 7 days (CIV-2063); missing from a server deployed before it. */ calls_7d?: number }
export interface McpTesterCall { id: number; at: string; tool: string; question: string | null; ok: number; ms: number }
