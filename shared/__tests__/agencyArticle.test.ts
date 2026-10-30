import { describe, expect, it } from 'vitest';
import { agencyInSentence, agencyPossessive, agencyTakesThe } from '../agencyArticle';

// CIV-1103 (draft): "The" before a name whose last word names an organization; acronyms, brands and the rest never.
describe('agency names in sentences', () => {
  it('adds "The" at the start and "the" elsewhere to organization names only', () => {
    expect(agencyInSentence('Toronto Transit Commission', true)).toBe('The Toronto Transit Commission');
    expect(agencyInSentence('Utah Transit Authority')).toBe('the Utah Transit Authority');
    for (const n of ['GO Transit', 'King County Metro', 'MiWay', 'MBTA', 'SEPTA', 'OC Transpo', 'City of Tulsa']) expect(agencyTakesThe(n)).toBe(false);
  });
  it('never doubles a name that already starts with "The"', () => {
    expect(agencyInSentence('The Kauai Bus', true)).toBe('The Kauai Bus');
    expect(agencyTakesThe('The Transit Authority')).toBe(false);
  });
  it('gives a plural name an apostrophe only, and every other name "\'s"', () => {
    expect(agencyPossessive('BC Ferries', true)).toBe("BC Ferries'");
    expect(agencyPossessive('Toronto Transit Commission', true)).toBe("The Toronto Transit Commission's");
    expect(agencyPossessive('SolTrans', true)).toBe("SolTrans's");
    expect(agencyPossessive('CATS', true)).toBe("CATS's");
  });
});
