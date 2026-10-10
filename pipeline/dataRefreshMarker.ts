import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_REFRESH_MARKER_PATH = path.resolve('tmp/atlas-data-refresh-marker.json');

export interface DataRefreshMarker {
  generatedAt: string;
  source: 'refresh' | 'process';
  slugs: string[];
  indexSha256: string;
  complete: true;
}

export type RefreshAgencyStatus = 'processed' | 'unchanged' | 'stale' | 'failed' | 'skipped' | 'refused';

export interface RefreshRunResult {
  generatedAt: string;
  requestedSlugs: string[];
  statuses: Record<string, RefreshAgencyStatus>;
  complete: boolean;
}

export const REFRESH_RESULT_PATH = path.resolve('tmp/atlas-refresh-result.json');

export function hashIndex(indexPath = path.resolve('public/data/index.json')): string {
  return createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
}

export function writeDataRefreshMarker(
  source: DataRefreshMarker['source'],
  slugs: string[],
  indexPath = path.resolve('public/data/index.json'),
): void {
  fs.mkdirSync(path.dirname(DATA_REFRESH_MARKER_PATH), { recursive: true });
  const marker: DataRefreshMarker = {
    generatedAt: new Date().toISOString(),
    source,
    slugs: [...new Set(slugs)].sort(),
    indexSha256: hashIndex(indexPath),
    complete: true,
  };
  fs.writeFileSync(DATA_REFRESH_MARKER_PATH, `${JSON.stringify(marker, null, 2)}\n`);
}

export function writeRefreshRunResult(
  requestedSlugs: string[],
  statuses: Record<string, RefreshAgencyStatus>,
): RefreshRunResult {
  const result: RefreshRunResult = {
    generatedAt: new Date().toISOString(),
    requestedSlugs: [...new Set(requestedSlugs)].sort(),
    statuses,
    complete: Object.values(statuses).every(status => status === 'processed' || status === 'unchanged'),
  };
  fs.mkdirSync(path.dirname(REFRESH_RESULT_PATH), { recursive: true });
  fs.writeFileSync(REFRESH_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/**
 * Whether PMTiles may be rebuilt after a refresh run. `complete` (every agency
 * processed or unchanged) is what refresh-release requires for a targeted
 * batch. A full run always has agencies that kept their live data (country-
 * gated, stale, drop-refused); their artifacts still match, so only a failed
 * agency blocks the rebuild.
 */
export function canRebuildPmtilesAfterRefresh(result: RefreshRunResult): boolean {
  return result.requestedSlugs.length > 0
    && Object.values(result.statuses).every(status => status !== 'failed');
}

export function readRefreshRunResult(): RefreshRunResult | null {
  if (!fs.existsSync(REFRESH_RESULT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(REFRESH_RESULT_PATH, 'utf8')) as RefreshRunResult;
  } catch {
    return null;
  }
}

export function clearDataRefreshHandoff(): void {
  for (const filePath of [DATA_REFRESH_MARKER_PATH, REFRESH_RESULT_PATH]) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  }
}

export function readDataRefreshMarker(): DataRefreshMarker | null {
  if (!fs.existsSync(DATA_REFRESH_MARKER_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DATA_REFRESH_MARKER_PATH, 'utf8')) as DataRefreshMarker;
  } catch {
    return null;
  }
}

export function dataRefreshGuardError(
  marker: DataRefreshMarker | null,
  indexPath = path.resolve('public/data/index.json'),
): string | null {
  if (!marker) {
    return 'No successful data refresh is pending. Run npm run refresh or npm run process first; refusing to rebuild PMTiles from stale data.';
  }
  if (marker.slugs.length === 0) {
    return 'The data refresh marker contains no refreshed agencies; refusing to rebuild PMTiles.';
  }
  if (marker.complete !== true) {
    return 'The data refresh did not complete for every requested agency; refusing to rebuild PMTiles.';
  }
  if (marker.indexSha256 !== hashIndex(indexPath)) {
    return 'The agency index changed after the data refresh; refresh the data again before rebuilding PMTiles.';
  }
  return null;
}

export function consumeDataRefreshMarker(): void {
  if (fs.existsSync(DATA_REFRESH_MARKER_PATH)) fs.rmSync(DATA_REFRESH_MARKER_PATH);
}
