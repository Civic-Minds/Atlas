import { describe, expect, it } from 'vitest';
import { shortenAgencyName } from '../format';
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
  // Multi-region single agencies (exo, BC Transit both legitimately operate
  // many service areas under one brand) are also expected, not collisions.
  const KNOWN_SHARED_ACRONYMS = new Set([
    'CAT', 'GET', 'The Bus', 'DART', 'CARTA',
    'SMART', 'TCAT', 'CATA', 'SCT', 'SAM', 'RTC', 'exo', 'BC Transit',
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
