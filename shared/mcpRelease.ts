/**
 * Which published release the Atlas Studio MCP reads (CIV-1855, CIV-2014): the release pointer the map reads
 * (`<origin>/atlas/release.json`), counted only once that release's MCP files are up (`mcp/manifest.json`), since the
 * pointer can move before they are uploaded. One place for the hosted Worker and the local server.
 */

/** Where a release's MCP files sit under the data origin. */
export const mcpReleaseBase = (origin: string, releaseId: string): string => `${origin.replace(/\/$/, '')}/atlas/releases/${releaseId}/mcp`;

export type McpReleaseCheck =
  | { kind: 'ready'; releaseId: string; base: string }
  /** The pointer names a release whose MCP files aren't up yet. */
  | { kind: 'notReady'; releaseId: string };

/** Reads the pointer, then checks the release's manifest. Throws when the pointer can't be read. */
export async function checkMcpRelease(origin: string, init?: RequestInit): Promise<McpReleaseCheck> {
  const res = await fetch(`${origin.replace(/\/$/, '')}/atlas/release.json`, init);
  if (!res.ok) throw new Error(`The release pointer could not be read (${res.status}).`);
  const { releaseId } = (await res.json()) as { releaseId: string };
  const base = mcpReleaseBase(origin, releaseId);
  const ready = await fetch(`${base}/manifest.json`, init);
  return ready.ok ? { kind: 'ready', releaseId, base } : { kind: 'notReady', releaseId };
}
