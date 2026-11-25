/**
 * CIV-2914: the current release's split MCP files, the store the hosted server reads (workers/atlas-mcp), for every local
 * reader of MCP data (atlas-studio-dev, Studio's route-now endpoint). Never a copy on this Mac. The pointer is re-read
 * at most once a minute, so a release published while a server runs is picked up.
 */
import * as data from './atlasData';
import { splitStore, urlReader } from '../../shared/mcpSplitStore';
import { checkMcpRelease } from '../../shared/mcpRelease';
import { R2_PUBLIC_URL } from '../../shared/config';
import { MCP_POINTER_RECHECK_MS } from '../../shared/rules/limits';

const POINTER_TIMEOUT_MS = 5_000;
let loaded: { releaseId: string; checkedAt: number } | null = null;

/** Points the tools at the current release; throws when none can be read (the caller says Atlas couldn't answer). */
export async function useCurrentRelease(): Promise<void> {
  const now = Date.now();
  if (loaded && now - loaded.checkedAt < MCP_POINTER_RECHECK_MS) return;
  const check = await checkMcpRelease(R2_PUBLIC_URL, { signal: AbortSignal.timeout(POINTER_TIMEOUT_MS) });
  if (check.kind === 'ready') {
    if (check.releaseId !== loaded?.releaseId) data.useStore(splitStore(urlReader(check.base)));
    loaded = { releaseId: check.releaseId, checkedAt: now };
  } else if (loaded) {
    // The pointer moved before the new release's MCP files were up: the release loaded keeps answering (as the hosted server does).
    loaded = { ...loaded, checkedAt: now };
  } else throw new Error('Atlas Studio has no schedule files for the current release yet. Try again later.');
}
