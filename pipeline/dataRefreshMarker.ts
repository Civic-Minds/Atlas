import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_REFRESH_MARKER_PATH = path.resolve('tmp/atlas-data-refresh-marker.json');

export interface DataRefreshMarker {
  generatedAt: string;
  source: 'refresh' | 'process';
  slugs: string[];
  indexSha256: string;
}

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
  };
  fs.writeFileSync(DATA_REFRESH_MARKER_PATH, `${JSON.stringify(marker, null, 2)}\n`);
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
  if (marker.indexSha256 !== hashIndex(indexPath)) {
    return 'The agency index changed after the data refresh; refresh the data again before rebuilding PMTiles.';
  }
  return null;
}

export function consumeDataRefreshMarker(): void {
  if (fs.existsSync(DATA_REFRESH_MARKER_PATH)) fs.rmSync(DATA_REFRESH_MARKER_PATH);
}
