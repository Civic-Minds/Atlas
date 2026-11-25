/**
 * Local only: an agency's short name for the Live API's sentences ("TTC", "Capital Metro"), read from the agency
 * registry (config/agencies/<slug>.json) and shortened as the map's cards and Live's titles do (CIV-1117).
 * A slug the registry does not list stays as written, never upper-cased.
 */
import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { agencyNames } from '../src/utils/agencyName';
import { configAgencyName } from '../shared/agencyRegistryName';

/** CIV-2914: where a server without the registry on disk (the cloud reader, atlas-live-read) finds an agency's full name. */
let nameLookup: ((slug: string) => Promise<string | null>) | null = null;
export function setAgencyNameLookup(lookup: ((slug: string) => Promise<string | null>) | null): void { nameLookup = lookup; }

export async function liveAgencyName(slug: string): Promise<string> {
  if (nameLookup) {
    const name = await nameLookup(slug).catch(() => null);
    return name ? agencyNames(name).name : slug;
  }
  const dir = resolve('config/agencies');
  // Only a file found in the registry listing is read, never a path built from the request's text.
  const file = (await readdir(dir).catch(() => [] as string[])).find(f => f === `${slug.toLowerCase()}.json`);
  if (!file) return slug;
  try {
    // The registry name built from the name fields (#1245), or an older entry's own `name`.
    const name = configAgencyName(JSON.parse(await readFile(resolve(dir, file), 'utf8')) as Record<string, unknown>);
    return name ? agencyNames(name).name : slug;
  } catch {
    return slug;
  }
}
