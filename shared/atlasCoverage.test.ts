import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import summaries from './data/agency-pages.json';
import coverage from './data/atlas-coverage.json';
import { atlasCoverageBySite, buildAgencyIndexData } from './agencyIndex';
import { coverageAgenciesText, coverageCountriesText } from './atlasCoverage';
import { aboutCountText } from './numberText';
import type { AgencyPageSummary } from './agencyPages';

const agencies = (summaries as unknown as { agencies: AgencyPageSummary[] }).agencies;
const ROOT = resolve(__dirname, '..');

describe('what Atlas covers (CIV-1724)', () => {
  it('the committed coverage file matches the committed agency page summaries', () => {
    // build-agency-page-summaries writes both; a regeneration that skips this file fails here instead of shipping a stale count.
    expect(coverage).toEqual(atlasCoverageBySite(agencies));
  });

  it('counts what the agencies index lists', () => {
    expect(coverage.public.agencies).toBe(buildAgencyIndexData(agencies.filter(a => !a.betaOnly), [], null).agencyCount);
  });

  it('reads as prose', () => {
    expect(aboutCountText(532)).toBe('530');
    expect(aboutCountText(1238)).toBe('1,230');
    expect(aboutCountText(7)).toBe('7');
    expect(coverageAgenciesText({ agencies: 532, countries: [] })).toBe('530');
    expect(coverageCountriesText({ agencies: 1, countries: ['Canada', 'United States'] })).toBe('Canada and the US');
    expect(coverageCountriesText({ agencies: 1, countries: ['Canada', 'France', 'United States'] })).toBe('Canada, France and the US');
  });

  it('no page types the agency count by hand', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'data' ? [] : files(p);
      return /\.(tsx?|mjs|html)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
    const typed = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'shared')), ...files(join(ROOT, 'api'))]
      .filter(f => /\b(about|over|nearly|almost|more than) [0-9][0-9,]* (transit )?agencies\b/i.test(readFileSync(f, 'utf8')))
      .map(f => relative(ROOT, f));
    expect(typed, 'use coverageAgenciesText() from shared/atlasCoverage.ts').toEqual([]);
  });
});
