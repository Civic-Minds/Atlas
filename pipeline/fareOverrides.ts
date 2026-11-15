/**
 * fare-overrides.json: per-agency adult fares that take precedence over the legacy `fare`
 * field in index.json.
 *
 * #1367: this used to be a public-URL fetch (data.transitatlas.fyi) that fell back to the legacy
 * fare on any failure. A Cloudflare challenge or dropped connection on a runner then published
 * old fares without a word. With R2 keys it is now read through R2 like every other pipeline
 * artifact, and any failure other than "the file does not exist" throws, so the run exits non-zero.
 */
import { r2Get } from './r2.js';
import { R2_PUBLIC_URL } from '../shared/config.js';

export const FARE_OVERRIDES_KEY = 'atlas/fare-overrides.json';

export type FareOverrides = Record<string, { adult?: number }>;

export interface FareOverridesDeps {
  /** True when the run has R2 keys (refresh always does; process-gtfs unless a keyless --dry-run). */
  hasR2Keys?: boolean;
  r2Get?: (key: string) => Promise<string | null>;
  fetch?: typeof fetch;
  publicUrl?: string;
  log?: (message: string) => void;
}

export function parseFareOverrides(raw: string, source: string): FareOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`fare-overrides.json from ${source} is not valid JSON (${(err as Error).message}); refusing to fall back to legacy fares.`);
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`fare-overrides.json from ${source} is not an object; refusing to fall back to legacy fares.`);
  }
  return parsed as FareOverrides;
}

export async function loadFareOverrides(deps: FareOverridesDeps = {}): Promise<FareOverrides> {
  const hasR2Keys = deps.hasR2Keys ?? Boolean(process.env.R2_ACCESS_KEY_ID);
  const log = deps.log ?? ((message: string) => console.log(message));

  if (hasR2Keys) {
    // r2Get returns null only for NoSuchKey; anything else (auth, network after retries) throws.
    const raw = await (deps.r2Get ?? r2Get)(FARE_OVERRIDES_KEY);
    if (raw == null) {
      log(`  fare overrides: ${FARE_OVERRIDES_KEY} not found in R2; using legacy fares`);
      return {};
    }
    const overrides = parseFareOverrides(raw, 'R2');
    log(`  fare overrides: ${Object.keys(overrides).length} agencies from R2`);
    return overrides;
  }

  // Keyless local dry run only (process-gtfs --dry-run in a worktree): the public file, but a
  // refusal or network error still fails the run instead of silently using legacy fares.
  const url = `${(deps.publicUrl ?? R2_PUBLIC_URL).replace(/\/$/, '')}/${FARE_OVERRIDES_KEY}`;
  const res = await (deps.fetch ?? fetch)(url);
  if (res.status === 404) {
    log(`  fare overrides: ${url} not found; using legacy fares`);
    return {};
  }
  if (!res.ok) {
    const by = [res.headers.get('server'), res.headers.get('cf-mitigated') && `cf-mitigated=${res.headers.get('cf-mitigated')}`]
      .filter(Boolean).join(' ');
    throw new Error(`Could not read ${url}: HTTP ${res.status}${by ? ` (${by})` : ''}; refusing to fall back to legacy fares.`);
  }
  const overrides = parseFareOverrides(await res.text(), url);
  log(`  fare overrides: ${Object.keys(overrides).length} agencies from ${url} (no R2 keys)`);
  return overrides;
}
