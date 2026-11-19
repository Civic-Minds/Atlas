import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_AGENCY_SLUGS, LIVE_POLLING_ROUTES } from '../livePollingConfig';

/**
 * CIV-1691 (Ryan: "Do we need to refactor this shit", then "1"): which agencies are live is said in one place,
 * LIVE_AGENCY_SLUGS in shared/livePollingConfig.ts, derived from LIVE_POLLING_ROUTES. A hand-kept second list
 * (the agency list's old LIVE_RECORDING_AGENCY_SLUGS) fails here.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const SOURCE = 'shared/livePollingConfig.ts';
// The archive Worker's record of which feeds it stores is not a list of live agencies for the UI.
const ARCHIVE = 'shared/liveArchiveFeeds.ts';

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    if (statSync(join(ROOT, rel)).isDirectory()) return files(rel);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

const code = ['src', 'shared', 'local-api'].flatMap(files).filter(f => f !== SOURCE && f !== ARCHIVE);
const quoted = (slug: string) => new RegExp(`['"\`]${slug}['"\`]`);

describe('one list of live agencies (CIV-1691)', () => {
  it('derives the list from the polled routes', () => {
    expect(LIVE_AGENCY_SLUGS.length).toBeGreaterThan(0);
    for (const slug of LIVE_AGENCY_SLUGS) expect(LIVE_POLLING_ROUTES.some(r => r.slug === slug)).toBe(true);
  });

  it('has no second list named for live agencies', () => {
    const named = code.filter(f => /\b(const|let)\s+LIVE_\w*(AGENCY|AGENCIES|RECORDING)\w*SLUGS\b/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(named.map(f => relative(ROOT, join(ROOT, f)))).toEqual([]);
  });

  // CIV-1899: the focus areas are places (a region's agencies, live or not), not a list of live agencies; only that block is
  // skipped. Which agencies are recorded comes from the archive shards, so the rest of focus.ts is checked like any file.
  const withoutFocusAreas = (f: string, text: string) =>
    f === 'shared/rules/focus.ts' ? text.replace(/export const FOCUS_AREAS[\s\S]*?\n\];/, '') : text;

  it('has no hand-typed array or set of live agency slugs', () => {
    const lists = code.filter(f => {
      const text = withoutFocusAreas(f, readFileSync(join(ROOT, f), 'utf8'));
      for (const m of text.matchAll(/(\[|new Set\(\[)([^\]]{0,400})\]/g)) {
        if (LIVE_AGENCY_SLUGS.filter(slug => quoted(slug).test(m[2])).length >= 2) return true;
      }
      return false;
    });
    expect(lists).toEqual([]);
  });

  // CIV-1797: the rule for a usable live feed (no API key, or marked active) is isLiveEligibleRoute; a copy fails.
  it('has no copy of the live-eligible rule', () => {
    const copies = code.filter(f => /apiKeyParamEnvVar[\s\S]{0,80}apiKeyHeaderEnvVar[\s\S]{0,40}\bactive\b/.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(copies).toEqual([]);
  });
});
