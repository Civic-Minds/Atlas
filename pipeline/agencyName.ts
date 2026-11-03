import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { configAgencyName } from '../shared/agencyRegistryName';

/** Display name: explicit CLI arg wins, then the config/agencies/<slug>.json name (built from its name fields), then the slug. */
export function resolveAgencyName(
  explicit: string | undefined,
  slug: string,
  configName: string | null | undefined,
): string {
  return explicit || configName || slug;
}

export function readConfigAgencyName(slug: string): string | null {
  const sourcePath = resolve('config/agencies', `${slug}.json`);
  if (!existsSync(sourcePath)) return null;
  try {
    // Built from the name fields (#1245), so it reads exactly as the index.json name does.
    return configAgencyName(JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>);
  } catch {
    return null;
  }
}
