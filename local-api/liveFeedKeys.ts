/**
 * Local only (CIV-2072; Ryan: "But that would still need us to intervene"): the local API dev server fills in the Live
 * feed keys by itself. A worktree's .env.local has no keys of its own, so the names Live's config asks for
 * (livePollingConfig: apiKeyParamEnvVar, apiKeyHeaderEnvVar) are copied from the main checkout's .env.local, and only
 * those: never R2_* or any other setting. A key already set in this process wins. A new Live city's key works on every
 * dev server as soon as it is in the main checkout's .env.local.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { LIVE_POLLING_ROUTES, isLiveEligibleRoute, type LiveRouteConfig } from '../shared/livePollingConfig.js';
import { mainCheckoutRoot } from './mcp-coverage.js';

/** Settings never copied, whatever the config names: the storage keys. */
const NEVER = /^R2_/;

/** The key names Live's config asks for, sorted. Storage keys and malformed names are left out. */
export function liveFeedKeyNames(routes: readonly Pick<LiveRouteConfig, 'apiKeyParamEnvVar' | 'apiKeyHeaderEnvVar'>[] = LIVE_POLLING_ROUTES): string[] {
  const names = routes.flatMap(r => [r.apiKeyParamEnvVar, r.apiKeyHeaderEnvVar]).filter((n): n is string => !!n);
  return [...new Set(names)].filter(n => /^[A-Z][A-Z0-9_]*$/.test(n) && !NEVER.test(n)).sort();
}

/**
 * Copies the allowed names that `env` lacks from `source` (the main checkout's .env.local, parsed). Returns what it
 * copied and the names set nowhere.
 */
export function fillLiveFeedKeys(env: NodeJS.ProcessEnv, source: Record<string, string>, names: readonly string[] = liveFeedKeyNames()): { copied: string[]; missing: string[] } {
  const copied: string[] = [], missing: string[] = [];
  for (const name of names) {
    if (NEVER.test(name)) continue;
    if (env[name]) continue;
    if (source[name]) { env[name] = source[name]; copied.push(name); } else missing.push(name);
  }
  return { copied, missing };
}

/** The main checkout's .env.local, parsed; empty outside git or without the file. */
function mainCheckoutDotenv(): Record<string, string> {
  const root = mainCheckoutRoot();
  const file = root ? resolve(root, '.env.local') : null;
  return file && existsSync(file) ? parse(readFileSync(file, 'utf8')) : {};
}

/**
 * At dev server start: fill the keys, and warn only about a key that is in no .env.local and that a switched-on route
 * needs (a keyed route that is not `active` shows nothing anyway).
 */
export function loadLiveFeedKeys(env: NodeJS.ProcessEnv = process.env): void {
  const { copied, missing } = fillLiveFeedKeys(env, mainCheckoutDotenv());
  const needed = new Set(liveFeedKeyNames(LIVE_POLLING_ROUTES.filter(isLiveEligibleRoute)));
  if (copied.length) console.log(`Live feed keys from the main checkout's .env.local: ${copied.join(', ')}`);
  for (const name of missing.filter(n => needed.has(n))) console.warn(`Live feed key ${name} is in no .env.local: Live shows no vehicles for the routes that need it.`);
}
