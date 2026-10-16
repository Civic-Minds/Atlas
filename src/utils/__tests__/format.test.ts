import { describe, expect, it } from 'vitest';
import { fmtHeadway, getRouteLabel, routeLabelCase, routeLabels, shouldHideNumericRouteShortName, shortenAgencyName, titleCase } from '../format';
import indexData from '../../../public/data/index.json';

interface IndexAgency {
  slug: string;
  name: string;
}

const agencies = (indexData as { agencies: IndexAgency[] }).agencies;

describe('shortenAgencyName', () => {
  // Specific regressions for confirmed substring collisions — a short
  // acronym check (e.g. "vta") matching inside an unrelated agency's full
  // legal name (e.g. "Antelope VTA" via "AVTA").
  it('does not mislabel agencies whose name contains "muni" as a substring', () => {
    expect(shortenAgencyName('GTrans (Gardena Municipal Bus Lines)')).not.toBe('SFMTA');
    expect(shortenAgencyName('Community Transit')).not.toBe('SFMTA');
  });

  it('does not mislabel agencies whose name contains "vta" as a substring', () => {
    expect(shortenAgencyName('Antelope Valley Transit Authority (AVTA)')).not.toBe('VTA');
    expect(shortenAgencyName('Victor Valley Transit Authority (VVTA)')).not.toBe('VTA');
  });

  it('does not mislabel agencies whose name contains "bart" as a substring', () => {
    expect(shortenAgencyName('BARTA (Reading)')).not.toBe('BART');
  });

  it('still recognizes the real agencies these checks are meant to catch', () => {
    expect(shortenAgencyName('San Francisco Municipal Transportation Agency (SFMTA)')).toBe('SFMTA');
    expect(shortenAgencyName('Santa Clara Valley Transportation Authority (VTA)')).toBe('VTA');
    expect(shortenAgencyName('Bay Area Rapid Transit (BART)')).toBe('BART');
  });

  // SF riders say "Muni", not "SFMTA" — SFMTA is the agency, Muni is the
  // service brand people actually use day to day. Only the compound form
  // (name explicitly says "Muni") should prefer it; bare "SFMTA" stays as-is.
  it('prefers "Muni" over "SFMTA" when the name explicitly says Muni', () => {
    expect(shortenAgencyName('San Francisco Municipal Transportation Agency (SFMTA - Muni)')).toBe('Muni');
    expect(shortenAgencyName('San Francisco Municipal Transportation Agency (SFMTA)')).toBe('SFMTA');
  });

  // Real-world agencies that genuinely share a brand acronym across
  // different regions (verified against index.json — these are actually
  // different, unrelated transit agencies, not a shortenAgencyName bug):
  //   CAT     — Canby Area Transit (OR) / Chatham Area Transit (Savannah, GA)
  //   GET     — Golden Empire Transit (CA) / Greeley-Evans Transit (CO)
  //   The Bus — Merced County Transit (CA) / Prince George's County (MD)
  //   DART    — Dallas Area Rapid Transit (TX) / Des Moines Area RTA (IA)
  //   CARTA   — Charleston Area RTA (SC) / Chattanooga Area RTA (TN)
  //   SMART   — Detroit suburbs (MI) / Sonoma-Marin (CA) / South Metro (OR)
  //   TCAT    — Tompkins County (NY) / Tulare County (CA)
  //   CATA    — Lansing (MI) / State College (PA)
  //   SCT     — Sonoma County (CA) / Suffolk County (NY)
  //   SAM     — Sandy Area Metro (OR) / Sioux Area Metro (SD)
  //   RTC     — RTC de Québec / Regional Transportation Commission of Southern Nevada
  //   Citibus — Lubbock, TX / Narbonne, France (Transports en Grand Narbonne, branded
  //             "Citibus" since 2010 — coincidental match with the unrelated US agency)
  //   TAC     — Annemasse, France (Transports Annemasse Collectivités) /
  //             Charleville-Mézières, France (Transports de l'Agglomération de
  //             Charleville-Mézières-Sedan) — same initials, unrelated networks
  //   TUB     — Saint-Brieuc, France (Transports Urbains Briochins) /
  //             Bergerac, France (Transports Urbains Bergeracois)
  // Multi-region single agencies (exo, BC Transit both legitimately operate
  // many service areas under one brand) are also expected, not collisions.
  const KNOWN_SHARED_ACRONYMS = new Set([
    'CAT', 'GET', 'The Bus', 'DART', 'CARTA',
    'SMART', 'TCAT', 'CATA', 'SCT', 'SAM', 'RTC', 'exo', 'BC Transit',
    'Citibus', 'TAC', 'TUB',
  ]);

  // General regression guard: no two distinct real agencies in the live
  // registry should collapse onto the same shortened name, other than the
  // documented real-world exceptions above. Catches this whole class of
  // bug automatically as new agencies are added, without needing another
  // manual/agent audit.
  it('produces a unique shortened name for every distinct agency in the registry', () => {
    const bySlug = new Map<string, string>();
    for (const a of agencies) bySlug.set(a.slug, shortenAgencyName(a.name));

    const byResult = new Map<string, string[]>();
    for (const [slug, result] of bySlug) {
      if (!byResult.has(result)) byResult.set(result, []);
      byResult.get(result)!.push(slug);
    }

    const collisions = [...byResult.entries()]
      .filter(([result, slugs]) => slugs.length > 1 && !KNOWN_SHARED_ACRONYMS.has(result));
    expect(collisions, `Multiple distinct agencies collapsed to the same shortened name: ${JSON.stringify(collisions)}`).toEqual([]);
  });
});

describe('titleCase', () => {
  it('title-cases three-letter service names while preserving short route codes', () => {
    expect(titleCase('MCKNIGHT')).toBe('McKnight');
    expect(titleCase('KING / B-LINE EXPRESS')).toBe('King / B-Line Express');
    expect(titleCase('RED')).toBe('Red');
    expect(titleCase('Gold')).toBe('Gold');
    expect(titleCase('GO')).toBe('GO');
    expect(titleCase('LW')).toBe('LW');
    expect(titleCase('SFU Exchange')).toBe('SFU Exchange');
  });

  it('preserves Brantford Transit’s NWIA acronym', () => {
    expect(titleCase('NWIA | Downtown')).toBe('NWIA | Downtown');
  });

  it('formats uppercase historical route names while preserving branded casing', () => {
    expect(titleCase('STOCKTON/BROADWAY')).toBe('Stockton/Broadway');
    expect(titleCase('CordoVan - Anatolia-Kavala Ranch')).toBe('CordoVan - Anatolia-Kavala Ranch');
  });

  it('formats the cleaned Brantford route 20 label', () => {
    expect(titleCase(getRouteLabel('20', 'Grand River Line'))).toBe('20 — Grand River Line');
  });

  it('hides internal numeric IDs for named rail lines', () => {
    expect(shouldHideNumericRouteShortName('30053', 'Expo Line', 1)).toBe(true);
  });
});

describe('titleCase and accented first letters', () => {
  it('does not split a word after an accented first letter', () => {
    expect(titleCase('ÎLE-DES-SOEURS')).toBe('Île-Des-Soeurs');
    expect(titleCase('Île-des-Soeurs')).toBe('Île-Des-Soeurs');
    expect(titleCase('ÉCOLE SECONDAIRE')).toBe('École Secondaire');
  });
});

describe('routeLabels case', () => {
  it('title-cases a shouting feed, and leaves a feed\'s own mixed-case spelling and short codes alone', () => {
    expect(routeLabelCase('STAMFORD/CT STATE')).toBe('Stamford/Ct State');
    expect(routeLabelCase('Kendall/MIT Station')).toBe('Kendall/MIT Station');
    expect(routeLabelCase('Île-des-Soeurs')).toBe('Île-des-Soeurs');
    for (const code of ['SL1', '34E', '1X', 'WCE', 'GO']) expect(routeLabelCase(code)).toBe(code);
  });
  it('gives the card title in title case and lists the cleaned names', () => {
    expect(routeLabels({ shortName: '961', longName: '757X - NORFOLK TO NNTC', routeType: 3 })).toMatchObject({ primary: '757X', secondary: 'Norfolk to NNTC', text: '757X — Norfolk to NNTC' });
    expect(routeLabels({ shortName: 'SL1', longName: 'Logan Airport Terminals - South Station', routeType: 3 })).toMatchObject({ primary: 'SL1', secondary: 'Logan Airport Terminals - South Station' });
  });
});

describe('fmtHeadway', () => {
  it('uses cautious wording for scheduled cadence', () => {
    expect(fmtHeadway(10)).toBe('about every 10 min');
    expect(fmtHeadway(90)).toBe('about every 1.5 h');
  });
});
