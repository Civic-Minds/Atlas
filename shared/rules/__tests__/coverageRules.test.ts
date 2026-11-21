import { describe, expect, it } from 'vitest';
import { ATLAS_COVERAGE, coverageAgenciesText, coverageCountriesText } from '../../atlasCoverage';
import coverage from '../../data/atlas-coverage.json';
import { BETA_BUILD } from '../flags';
import { countText } from '../../numberText';

/**
 * Rules audit move 11: what Atlas says it covers follows the committed shared/data/atlas-coverage.json (checked against
 * the agency summaries in shared/atlasCoverage.test.ts). The agency count is read from that file, never typed here, so
 * the weekly feed refresh cannot break this test.
 */
describe('what Atlas says it covers (rules audit move 11)', () => {
  it('keeps this build\'s coverage', () => {
    expect(ATLAS_COVERAGE).toEqual(BETA_BUILD ? coverage.beta : coverage.public);
    expect(ATLAS_COVERAGE.countries).toEqual(['Canada', 'United States']);
  });

  it('keeps the wording', () => {
    expect(coverageAgenciesText()).toBe(countText((BETA_BUILD ? coverage.beta : coverage.public).agencies));
    expect(coverageCountriesText()).toBe('Canada and the US');
    expect(coverageAgenciesText({ agencies: 1238, countries: [] })).toBe('1,238');
    expect(coverageCountriesText({ agencies: 1, countries: ['Canada', 'France', 'United States'] })).toBe('Canada, France and the US');
    expect(coverageCountriesText({ agencies: 1, countries: ['United States'] })).toBe('the US');
  });
});
