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

/** Route modes a config modeOverrides entry may assign (100 = light rail). */
export const OVERRIDE_MODES = [0, 1, 2, 3, 4, 5, 6, 11, 12, 100] as const;

/**
 * Collect every agency's `modeOverrides` (config/agencies/<slug>.json) into the file shared/modes.ts reads,
 * shared/data/mode-overrides.json. Each entry names the agency's route (routeShortName and/or routeLongName),
 * the GTFS route_type the feed publishes (the override only applies while the feed still says that), the
 * corrected mode and a short reason. Throws on anything malformed so a bad entry fails the build and CI.
 */
export function generateModeOverrides(agencies: Array<Record<string, unknown>>): { contents: string; count: number } {
  const overrides: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const agency of agencies) {
    const list = agency.modeOverrides;
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error(`${String(agency.slug)}: modeOverrides must be an array`);
    for (const raw of list as Array<Record<string, unknown>>) {
      const where = `${String(agency.slug)} modeOverrides ${JSON.stringify(raw.routeShortName ?? raw.routeLongName)}`;
      const names = ['routeShortName', 'routeLongName'].filter(k => raw[k] !== undefined);
      if (names.length === 0) throw new Error(`${where}: needs routeShortName or routeLongName`);
      for (const k of names) if (typeof raw[k] !== 'string' || !(raw[k] as string).trim() || raw[k] !== (raw[k] as string).trim()) throw new Error(`${where}: ${k} must be a trimmed non-empty string`);
      if (!Number.isInteger(raw.routeType)) throw new Error(`${where}: routeType (the GTFS type being corrected) is required`);
      if (!(OVERRIDE_MODES as readonly unknown[]).includes(raw.mode)) throw new Error(`${where}: mode must be one of ${OVERRIDE_MODES.join(', ')}`);
      if (raw.mode === raw.routeType) throw new Error(`${where}: mode equals routeType, so the override does nothing`);
      if (typeof raw.reason !== 'string' || raw.reason.trim().length < 10) throw new Error(`${where}: reason is required`);
      const key = `${String(agency.slug)}|${raw.routeType}|${raw.routeShortName ?? ''}|${raw.routeLongName ?? ''}`;
      if (seen.has(key)) throw new Error(`${where}: duplicate override`);
      seen.add(key);
      overrides.push({
        agencySlug: agency.slug,
        routeType: raw.routeType,
        ...(raw.routeShortName !== undefined ? { routeShortName: raw.routeShortName } : {}),
        ...(raw.routeLongName !== undefined ? { routeLongName: raw.routeLongName } : {}),
        mode: raw.mode,
        reason: raw.reason,
      });
    }
  }
  return { contents: `${JSON.stringify({ overrides }, null, 2)}\n`, count: overrides.length };
}
