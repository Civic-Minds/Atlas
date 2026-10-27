import { describe, expect, it } from 'vitest';
import indexData from '../../../public/data/index.json';
import { agencyListParts, agencyNameParts, agencyNames } from '../format';

const agencies = (indexData as { agencies: unknown[] }).agencies as Array<{ slug: string; name: string; cities?: string[]; displayArea?: string }>;
const bySlug = new Map(agencies.map(a => [a.slug, a]));

describe('agency short names (CIV-998)', () => {
  it('never uses a city as the short name', () => {
    expect(agencyNames('Capital Metro (Austin)').name).toBe('Capital Metro');
    expect(agencyNames('Valley Metro (Phoenix)').name).toBe('Valley Metro');
    expect(agencyNames('Codiac Transpo (Moncton)').name).toBe('Codiac Transpo');
    expect(agencyNames('Corvallis Transit System').name).toBe('Corvallis Transit System');
  });

  it('keeps a bracketed brand code and known short forms', () => {
    expect(agencyNames('Chicago Transit Authority (CTA)').name).toBe('CTA');
    expect(agencyNames('Toronto Transit Commission').name).toBe('TTC');
    expect(agencyNames('Spokane Transit Authority').name).toBe('Spokane Transit');
    expect(agencyNames('San Francisco Municipal Transportation Agency (SFMTA - Muni)').name).toBe('Muni');
  });

  it('uses the config short form only where the own name is too long for a row', () => {
    expect(agencyNames('Gary Public Transportation Corporation (Gary, IN)').name).toBe('GPTC');
    expect(agencyNames('Gary Public Transportation Corporation (Gary, IN)').backLink).toBe('GPTC');
    expect(agencyNames('STM (Montréal)').name).toBe('STM');
  });

  it('lists show the short name with the place beside it (#1134)', () => {
    expect(agencyListParts(bySlug.get('ttc')!)).toEqual({ primary: 'TTC', secondary: 'Toronto' });
    expect(agencyListParts(bySlug.get('gptc')!)).toEqual({ primary: 'GPTC', secondary: 'Gary' });
    expect(agencyListParts(bySlug.get('calgary')!).primary).toBe('Calgary Transit');
  });

  it('the card title is the full name, never a bracketed city (#1134)', () => {
    expect(agencyNameParts(bySlug.get('gptc')!).primary).toBe('Gary Public Transportation Corporation');
    expect(agencyNameParts(bySlug.get('um-transit')!).primary).toBe('University of Michigan Transit Services');
  });

  it('no agency in the registry gets a city or a bracketed place as its short name', () => {
    for (const a of agencies) {
      const bracket = a.name.match(/\(([^)]+)\)\s*$/)?.[1].trim();
      const city = a.cities?.[0]?.split(',')[0]?.trim();
      const { name } = agencyNames(a.name);
      const cityNames = (a.cities ?? []).map(c => c.split(',')[0].trim());
      if (bracket && (/, [A-Z]{2}$/.test(bracket) || cityNames.includes(bracket))) expect.soft(name, a.slug).not.toBe(bracket);
      if (city && !a.name.trim().startsWith(city + ' ') && a.name.trim() !== city) expect.soft(name, a.slug).not.toBe(city);
    }
  });
});
