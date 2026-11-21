import { describe, expect, it } from 'vitest';
import { ATLAS_COVERAGE, coverageAgenciesText, coverageCountriesText } from '../../atlasCoverage';

/**
 * Rules audit move 11: what Atlas says it covers, pinned as literals so moving the words into shared/rules/coverage.ts
 * is proven to change nothing. The counts come from the committed shared/data/atlas-coverage.json (checked against the
 * agency summaries in shared/atlasCoverage.test.ts).
 */
describe('what Atlas says it covers (rules audit move 11)', () => {
  it('keeps this build\'s coverage', () => {
    expect(ATLAS_COVERAGE).toEqual({ agencies: 535, countries: ['Canada', 'United States'] });
  });

  it('keeps the wording', () => {
    expect(coverageAgenciesText()).toBe('535');
    expect(coverageCountriesText()).toBe('Canada and the US');
    expect(coverageAgenciesText({ agencies: 1238, countries: [] })).toBe('1,238');
    expect(coverageCountriesText({ agencies: 1, countries: ['Canada', 'France', 'United States'] })).toBe('Canada, France and the US');
    expect(coverageCountriesText({ agencies: 1, countries: ['United States'] })).toBe('the US');
  });
});
