import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/** Display name: explicit CLI arg wins, then config/agencies/<slug>.json name, then the slug. */
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
    const name = (JSON.parse(readFileSync(sourcePath, 'utf8')) as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name : null;
  } catch {
    return null;
  }
}
