import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgencyPageSummaries } from '../shared/agencyPages';
import { nextVercelJson, readFormerSlugs } from './build-area-page-list';

// #1930: the area-page step rewrote vercel.json from a fixed key list, moving ignoreCommand and the hand-added redirects.
describe('build-area-page-list vercel.json writer', () => {
  const text = readFileSync('vercel.json', 'utf8');
  const summaries = JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')) as AgencyPageSummaries;

  it('leaves the committed vercel.json unchanged when its inputs are unchanged', () => {
    expect(nextVercelJson(text, summaries, readFormerSlugs())).toBe(text);
  });

  it('keeps ignoreCommand and every other key, in place', () => {
    const config = JSON.parse(text) as Record<string, unknown>;
    const out = JSON.parse(nextVercelJson(text, summaries, readFormerSlugs())) as Record<string, unknown>;
    expect(out.ignoreCommand).toBe('bash scripts/vercel-ignore-build.sh');
    expect(Object.keys(out)).toEqual(Object.keys(config));
  });

  it('a file with no redirects gets them just before rewrites', () => {
    const { redirects: _r, ...rest } = JSON.parse(text) as Record<string, unknown>;
    const out = JSON.parse(nextVercelJson(JSON.stringify(rest), summaries, readFormerSlugs())) as Record<string, unknown>;
    const keys = Object.keys(out);
    expect(keys.indexOf('redirects')).toBe(keys.indexOf('rewrites') - 1);
    expect(out.ignoreCommand).toBe('bash scripts/vercel-ignore-build.sh');
  });
});
