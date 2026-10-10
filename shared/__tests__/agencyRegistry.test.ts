/**
 * Contract tests on the real agency registry: config/agencies/*.json -> order.json ->
 * public/data/index.json -> the per-mode browser catalogs. Hidden, staged and beta-only
 * agencies must land in exactly the catalogs they belong in, and no agency file may be
 * silently left out of the index (#667).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgencyCatalog } from '../agencyCatalog';
import type { AtlasMode } from '../config';

const REPO = join(import.meta.dirname, '../..');
const AGENCY_DIR = join(REPO, 'config/agencies');

type Agency = Record<string, unknown> & { slug: string; staged?: boolean; hiddenInProduction?: boolean; betaOnly?: boolean };

const order = JSON.parse(readFileSync(join(AGENCY_DIR, 'order.json'), 'utf8')) as string[];
const agencyFiles = readdirSync(AGENCY_DIR).filter(file => file.endsWith('.json') && file !== 'order.json');
const index = JSON.parse(readFileSync(join(REPO, 'public/data/index.json'), 'utf8')) as { agencies: Agency[] };

// Known gap, tracked in #667: added 2026-09-10 without an order.json entry, then dropped by
// the next index build. Remove each slug from this list as it is resolved; never add to it.
const UNLISTED_AGENCY_FILES_667 = [
  'bowling-green', 'howard-county', 'kittitas-county', 'knox-county',
  'mckinley-county', 'ottumwa', 'sevier-county', 'sierra-vista',
];

describe('agency registry -> index.json', () => {
  it('index.json is exactly the registry files in order.json order (no hand edits)', () => {
    const fromRegistry = order.map(slug => JSON.parse(readFileSync(join(AGENCY_DIR, `${slug}.json`), 'utf8')));
    expect(index.agencies).toEqual(fromRegistry);
  });

  it('every agency file is listed in order.json, apart from the known #667 exceptions', () => {
    const listed = new Set(order);
    const unlisted = agencyFiles.map(file => file.replace(/\.json$/, '')).filter(slug => !listed.has(slug)).sort();
    expect(unlisted).toEqual(UNLISTED_AGENCY_FILES_667);
  });
});

describe('browser catalogs built from the real registry', () => {
  const catalog = (mode: AtlasMode) => new Set(buildAgencyCatalog(index.agencies, mode).agencies.map(agency => agency.slug));
  const modes: AtlasMode[] = ['public', 'preview', 'beta', 'dev'];
  const hidden = index.agencies.filter(agency => agency.hiddenInProduction && !agency.staged);
  const staged = index.agencies.filter(agency => agency.staged);

  it('the registry has hidden agencies to check (otherwise these tests prove nothing)', () => {
    expect(hidden.length).toBeGreaterThan(10);
  });

  it('public shows no hidden or staged agency', () => {
    const shown = catalog('public');
    expect([...hidden, ...staged].filter(agency => shown.has(agency.slug)).map(agency => agency.slug)).toEqual([]);
  });

  it('staged agencies appear in no catalog, not even dev', () => {
    for (const mode of modes) {
      const shown = catalog(mode);
      expect(staged.filter(agency => shown.has(agency.slug)).map(agency => agency.slug), mode).toEqual([]);
    }
  });

  it('preview and beta show a hidden agency only when it is marked beta-only', () => {
    for (const mode of ['preview', 'beta'] as const) {
      const shown = catalog(mode);
      const leaked = hidden.filter(agency => shown.has(agency.slug) !== (agency.betaOnly === true));
      expect(leaked.map(agency => agency.slug), mode).toEqual([]);
    }
  });

  it('dev shows every non-staged agency', () => {
    expect(catalog('dev').size).toBe(index.agencies.length - staged.length);
  });

  it('no catalog carries feed source URLs', () => {
    for (const mode of modes) {
      for (const agency of buildAgencyCatalog(index.agencies, mode).agencies as unknown as Agency[]) {
        expect(agency, agency.slug).not.toHaveProperty('feedUrl');
        expect(agency, agency.slug).not.toHaveProperty('mdbFeedUrl');
        expect(agency, agency.slug).not.toHaveProperty('supplementalFeedUrls');
      }
    }
  });
});
