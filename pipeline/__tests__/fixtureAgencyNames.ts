/**
 * #1289: a fixture cut from an agency's feed is read with that agency's sameNameRoutes, as the real
 * agency is, so a fixture of separate lines sharing a short name (NYC subway S) gets its approved
 * names instead of failing. The agency is the longest config slug the fixture name starts with.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SameNameRoute } from '../preprocess/same-name-routes.js';

const CONFIG = resolve(import.meta.dirname, '../../config/agencies');
const SLUGS = existsSync(CONFIG) ? readdirSync(CONFIG).filter(f => f.endsWith('.json') && f !== 'order.json').map(f => f.slice(0, -5)) : [];

export function fixtureSameNameRoutes(fixture: string): SameNameRoute[] | undefined {
  const slug = SLUGS.filter(s => fixture === s || fixture.startsWith(`${s}-`)).sort((a, b) => b.length - a.length)[0];
  if (!slug) return undefined;
  return (JSON.parse(readFileSync(resolve(CONFIG, `${slug}.json`), 'utf8')) as { sameNameRoutes?: SameNameRoute[] }).sameNameRoutes;
}
