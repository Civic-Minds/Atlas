/**
 * Which published release the Atlas Studio MCP reads (CIV-1855, CIV-2014): the release pointer the map reads
 * (`<origin>/atlas/release.json`), counted only once that release's MCP files are up (`mcp/manifest.json`), since the
 * pointer can move before they are uploaded. One place for the hosted Worker and the local server.
 */
import { isCompatibleReleasePointer, type ReleasePointerFields } from './artifactSchema';

/** Where a release's MCP files sit under the data origin. */
export const mcpReleaseBase = (origin: string, releaseId: string): string => `${origin.replace(/\/$/, '')}/atlas/releases/${releaseId}/mcp`;

export type McpReleaseCheck =
  | { kind: 'ready'; releaseId: string; base: string }
  /** The pointer names a release whose MCP files aren't up yet. */
  | { kind: 'notReady'; releaseId: string }
  /** The pointer names a release this code can't read (another artifact schema or tile rules), which the map refuses too (CIV-3019). */
  | { kind: 'incompatible'; releaseId: string };

/**
 * Reads the pointer, then checks the release's manifest. Throws when the pointer can't be read. `get` reads a URL under
 * the origin: fetch by default; the hosted Worker passes one over its R2 binding (CIV-3165).
 */
export async function checkMcpRelease(origin: string, init?: RequestInit, get: typeof fetch = fetch): Promise<McpReleaseCheck> {
  const res = await get(`${origin.replace(/\/$/, '')}/atlas/release.json`, init);
  if (!res.ok) throw new Error(`The release pointer could not be read (${res.status}).`);
  const pointer = (await res.json()) as ReleasePointerFields & { releaseId: string };
  const { releaseId } = pointer;
  if (!isCompatibleReleasePointer(pointer)) return { kind: 'incompatible', releaseId: String(releaseId) };
  const base = mcpReleaseBase(origin, releaseId);
  const ready = await get(`${base}/manifest.json`, init);
  return ready.ok ? { kind: 'ready', releaseId, base } : { kind: 'notReady', releaseId };
}
