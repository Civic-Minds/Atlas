import { describe, expect, it } from 'vitest';
import { agencyInSentence } from '../agencyArticle';
import { estimatedNote } from '../liveWording';

describe('agencyInSentence (CIV-1103)', () => {
  it('gives "the" to letter-by-letter acronyms and the listed endings, not to brands or word acronyms', () => {
    expect(agencyInSentence('TTC')).toBe('the TTC');
    expect(agencyInSentence('MBTA')).toBe('the MBTA');
    expect(agencyInSentence('MiWay')).toBe('MiWay');
    expect(agencyInSentence('MARTA')).toBe('MARTA');
    expect(agencyInSentence('SEPTA')).toBe('SEPTA');
    expect(agencyInSentence('Capital Metro')).toBe('Capital Metro');
    expect(agencyInSentence('Chicago Transit Authority')).toBe('the Chicago Transit Authority');
    expect(agencyInSentence('The Staten Island Ferry')).toBe('The Staten Island Ferry');
  });
  it('the Live subtitle says "not reported by MiWay" (#1474), and still "by the TTC"', () => {
    expect(estimatedNote('MiWay')).toBe('estimated from vehicle positions, not reported by MiWay');
    expect(estimatedNote('TTC')).toBe('estimated from vehicle positions, not reported by the TTC');
  });
});
