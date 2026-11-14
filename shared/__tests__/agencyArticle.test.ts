import { describe, expect, it } from 'vitest';
import { agencyArticle, agencyInSentence, agencyPossessive, agencyPossessiveSentenceStart, agencySentenceStart } from '../agencyArticle';
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
  it('follows the approved "Letter by letter" list, mixed names included', () => {
    for (const n of ['CTA', 'STM', 'HSR', 'WSF', 'MTA NYCT Subway', 'MTA Maryland', 'RTD Denver', 'Greater Dayton RTA', 'Champaign-Urbana MTD', 'San Joaquin RTD']) {
      expect(agencyInSentence(n)).toBe(`the ${n}`);
    }
  });
  it('follows the approved "Said as a word" list', () => {
    for (const n of ['BART', 'WMATA', 'DART', 'PATH', 'REM', 'DDOT', 'MATA', 'CATS']) expect(agencyInSentence(n)).toBe(n);
  });
  it('gives brands no "the" unless they end in a rule word', () => {
    for (const n of ['GO Transit', 'OC Transpo', 'BC Ferries', 'C-TRAN', 'Coast RTA', 'ABQ RIDE', 'NYC Ferry']) expect(agencyInSentence(n)).toBe(n);
    expect(agencyInSentence('SunLine Transit Agency')).toBe('the SunLine Transit Agency');
    expect(agencyInSentence('MTA Bus Company')).toBe('the MTA Bus Company');
    expect(agencyInSentence('The COMET')).toBe('The COMET');
  });
  it('the "Still unclear" rows follow their guess', () => {
    for (const n of ['OCTA', 'AVTA', 'LADOT', 'LADOT/DASH', 'TOR']) expect(agencyInSentence(n)).toBe(`the ${n}`);
    for (const n of ['TCAT', 'LAVTA', 'RABA', 'SLORTA', 'NORTA', 'WATA', 'ECAT']) expect(agencyInSentence(n)).toBe(n);
  });
  it('an all-caps name in no list keeps the default, letter by letter', () => {
    expect(agencyInSentence('XYZT')).toBe('the XYZT');
  });
  it('gives "the" to the four names Ryan added (Q1)', () => {
    for (const n of ['Staten Island Ferry', 'Cheyenne Transit Program', 'Fayetteville Area System of Transit', 'Yamhill County Transit Area']) {
      expect(agencyInSentence(n)).toBe(`the ${n}`);
    }
  });
  it('decides on the name without a page title qualifier or a registry bracket', () => {
    expect(agencyInSentence('MTA NYCT Bus · Brooklyn')).toBe('the MTA NYCT Bus · Brooklyn');
    expect(agencyInSentence('Edmonton Transit Service (ETS)')).toBe('the Edmonton Transit Service (ETS)');
    expect(agencyArticle('TTC')).toBe('the ');
    expect(agencyArticle('MiWay')).toBe('');
  });
  it('the Live subtitle says "not reported by MiWay" (#1474), and still "by the TTC"', () => {
    expect(estimatedNote('MiWay')).toBe('estimated from vehicle positions, not reported by MiWay');
    expect(estimatedNote('TTC')).toBe('estimated from vehicle positions, not reported by the TTC');
  });
});

describe('agencySentenceStart (CIV-1103)', () => {
  it('capitalises "The" at the start of a sentence and leaves other names as they are', () => {
    expect(agencySentenceStart('TTC')).toBe('The TTC');
    expect(agencySentenceStart('Utah Transit Authority')).toBe('The Utah Transit Authority');
    expect(agencySentenceStart('MiWay')).toBe('MiWay');
    expect(agencySentenceStart('exo')).toBe('exo');
    expect(agencySentenceStart('The Rapid')).toBe('The Rapid');
  });
});

describe('agencyPossessive (CIV-1103)', () => {
  it('gives the seven plural names an apostrophe alone', () => {
    for (const n of ['BC Ferries', 'Pierce County Ferries', 'Washington State Ferries', 'Montebello Bus Lines', 'Santa Fe Trails', 'University of Michigan Transit Services']) {
      expect(agencyPossessive(n)).toBe(`${n}’`);
    }
  });
  it('gives a singular name ending in s ’s', () => {
    expect(agencyPossessive('Cherriots')).toBe('Cherriots’s');
    expect(agencyPossessive('CATS')).toBe('CATS’s');
    expect(agencyPossessive('MiWay')).toBe('MiWay’s');
  });
  it('a slash name uses its first name', () => {
    expect(agencyPossessive('Lawrence Transit / KU on Wheels')).toBe('Lawrence Transit’s');
    expect(agencyPossessive('LADOT/DASH')).toBe('the LADOT/DASH’s');
  });
  it('carries the article, capitalised at the start of a sentence', () => {
    expect(agencyPossessive('TTC')).toBe('the TTC’s');
    expect(agencyPossessiveSentenceStart('TTC')).toBe('The TTC’s');
    expect(agencyPossessiveSentenceStart('Toronto Transit Commission')).toBe('The Toronto Transit Commission’s');
    expect(agencyPossessiveSentenceStart('BC Ferries')).toBe('BC Ferries’');
    expect(agencyPossessiveSentenceStart('Staten Island Ferry')).toBe('The Staten Island Ferry’s');
  });
});

describe('slash names read as their first name in any sentence (STYLE.md)', () => {
  it('uses the first name', async () => {
    const { agencyInSentence, agencySentenceStart } = await import('../agencyArticle');
    expect(agencyInSentence('Lawrence Transit / KU on Wheels')).toBe('Lawrence Transit');
    expect(agencySentenceStart('Lawrence Transit / KU on Wheels')).toBe('Lawrence Transit');
  });
});
