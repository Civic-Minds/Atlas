/**
 * Shared generators for public/data/index.json and catalog-*.json.
 * Used by the build scripts and by check-agency-index-drift.ts so CI compares
 * the committed files against exactly what the build would write.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgencyCatalog } from '../shared/agencyCatalog.js';
import type { AtlasMode } from '../shared/config.js';

export const CATALOG_MODES: AtlasMode[] = ['public', 'preview', 'beta', 'dev'];

/** Read config/agencies (in order.json order) and return the index.json file contents. */
export function generateAgencyIndex(sourceDir: string): { contents: string; agencies: Array<Record<string, unknown>> } {
  const orderPath = resolve(sourceDir, 'order.json');
  const files = readdirSync(sourceDir)
    .filter(name => name.endsWith('.json'))
    .filter(name => name !== 'order.json');
  const order = files.length > 0 && existsSync(orderPath)
    ? JSON.parse(readFileSync(orderPath, 'utf8')) as string[]
    : files.map(name => name.replace(/\.json$/, '')).sort();
  const agencies = order.map(slug => JSON.parse(readFileSync(resolve(sourceDir, `${slug}.json`), 'utf8')) as Record<string, unknown>);

  if (agencies.length === 0) throw new Error('No agency source files found');
  const slugs = new Set<unknown>();
  for (const agency of agencies) {
    if (!agency.slug || slugs.has(agency.slug)) throw new Error(`Invalid or duplicate agency slug: ${String(agency.slug)}`);
    slugs.add(agency.slug);
  }

  return { contents: `${JSON.stringify({ agencies }, null, 2)}\n`, agencies };
}

/** Return the catalog-<mode>.json file contents for an agency list. */
export function generateAgencyCatalog(agencies: Array<Record<string, unknown>>, mode: AtlasMode): { contents: string; agencyCount: number } {
  const catalog = buildAgencyCatalog(agencies, mode);
  return { contents: `${JSON.stringify(catalog)}\n`, agencyCount: catalog.agencyCount };
}
