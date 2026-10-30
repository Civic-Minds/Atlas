import { describe, expect, it } from 'vitest';
import { COMPARE_PANEL_TOP, comparePanelTop, fmtHeadway, getRouteLabel, ROUTE_NAME_ACRONYMS, routeLabels, shouldHideNumericRouteShortName, nameCase } from '../format';

import { agencyNames } from '../agencyName';

const shortenAgencyName = (name: string) => agencyNames(name).short;
// The bracket-aware short name is the row name for every name below (none is past the length rule).
const agencyBackLinkName = (name: string) => agencyNames(name).name;
import indexData from '../../../public/data/index.json';

// Today's three casing behaviours, now modes of nameCase (CIV-1001).
const titleCase = (s: string) => nameCase(s, 'title');
const stopNameCase = (s: string) => nameCase(s, 'stop');
const routeLabelCase = (s: string) => nameCase(s, 'route');

interface IndexAgency {
  slug: string;
  name: string;
}

const agencies = (indexData as { agencies: IndexAgency[] }).agencies;

describe('one capitals rule for stop and destination names (CIV-935)', () => {
  it('keeps real abbreviations in capitals and writes the rest in normal case', () => {
    expect(titleCase('LBJ / CENTRAL STATION')).toBe('LBJ / Central Station');
    expect(titleCase('Lbj / Central')).toBe('LBJ / Central');
    expect(titleCase('DFW AIRPORT STATION')).toBe('DFW Airport Station');
    expect(titleCase('CBD WEST TRANSFER CENTER')).toBe('CBD West Transfer Center');
    expect(titleCase('MOODY CENTER')).toBe('Moody Center');
    expect(titleCase('Alameda & Bob Hope EB')).toBe('Alameda & Bob Hope EB');
    expect(titleCase('2230 3rd Ave (YMCA)')).toBe('2230 3rd Ave (YMCA)');
  });

  it('leaves French and Spanish words alone', () => {
    expect(titleCase('LE HAILLAN ROSTAND')).toBe('Le Haillan Rostand');
    expect(titleCase('GARE DE DIJON VILLE')).toBe('Gare De Dijon Ville');
    expect(titleCase('PLACE STANISLAS')).toBe('Place Stanislas');
    expect(titleCase('LA MINERVA')).toBe('La Minerva');
  });

  it("cases an all-capitals stop name and leaves a feed's own mixed case alone", () => {
    expect(stopNameCase('MOODY CENTER')).toBe('Moody Center');
    expect(stopNameCase('Lower Jarvis St at The Esplanade')).toBe('Lower Jarvis St at The Esplanade');
  });

  it('keeps route-name-only words out of stop names', () => {
    expect(titleCase('MAX BROWN BLVD')).toBe('Max Brown Blvd');
    expect(routeLabelCase('MAX BLUE LINE')).toBe('MAX Blue Line');
    expect(ROUTE_NAME_ACRONYMS.has('CBD')).toBe(true);
    expect(ROUTE_NAME_ACRONYMS.has('LBJ')).toBe(true);
  });
});

describe('agencyBackLinkName', () => {
  it('never swaps the name for a bracketed city (#1102)', () => {
    expect(agencyBackLinkName('Valley Metro (Phoenix)')).toBe('Valley Metro');
    expect(agencyBackLinkName('Capital Metro (Austin)')).toBe('Capital Metro');
    expect(agencyBackLinkName('Cascades East Transit (Bend, OR)')).toBe('Cascades East Transit');
  });

  it('still uses a bracketed brand code, and otherwise matches shortenAgencyName', () => {
    expect(agencyBackLinkName('Dallas Area Rapid Transit (DART)')).toBe('DART');
    expect(agencyBackLinkName('Clemson Area Transit (CATbus)')).toBe('CATbus');
    expect(agencyBackLinkName('Sacramento Regional Transit (SacRT)')).toBe('SacRT');
    expect(agencyBackLinkName('Los Angeles County Metropolitan Transportation Authority (LA Metro)')).toBe('LA Metro');
    expect(agencyBackLinkName('Toronto Transit Commission')).toBe('TTC');
  });

  it('leaves lists on the shortened name', () => {
    expect(shortenAgencyName('Valley Metro (Phoenix)')).toBe('Phoenix');
  });
});

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

describe('titleCase on stop names', () => {
  it('turns all-caps stop names into normal title case', () => {
    expect(titleCase('RONCESVALLES AVE AT HOWARD PARK AVE SOUTH SIDE')).toBe('Roncesvalles Ave at Howard Park Ave South Side');
    expect(titleCase('KING ST W AT SPADINA AVE')).toBe('King St W at Spadina Ave');
    expect(titleCase('QUEEN ST E AT MCNAB RD')).toBe('Queen St E at McNab Rd');
    expect(titleCase("DUNDAS ST W AT O'CONNOR DR")).toBe("Dundas St W at O'Connor Dr");
    expect(titleCase('TTC SUBWAY AT BAY ST (NORTH SIDE)')).toBe('TTC Subway at Bay St (North Side)');
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
    // The linking word inside the hyphenated name stays small (CIV-1054).
    expect(titleCase('ÎLE-DES-SOEURS')).toBe('Île-des-Soeurs');
    expect(titleCase('Île-des-Soeurs')).toBe('Île-des-Soeurs');
    expect(titleCase('ÉCOLE SECONDAIRE')).toBe('École Secondaire');
  });
});

describe('routeLabels case', () => {
  it('title-cases a shouting feed, and leaves a feed\'s own mixed-case spelling and short codes alone', () => {
    expect(routeLabelCase('STAMFORD/CT STATE')).toBe('Stamford/Ct State');
    expect(routeLabelCase('Kendall/MIT Station')).toBe('Kendall/MIT Station');
    expect(routeLabelCase('Île-des-Soeurs')).toBe('Île-des-Soeurs');
    for (const code of ['SL1', '34E', '1X', 'WCE', 'GO', 'J14', 'BART']) expect(routeLabelCase(code)).toBe(code);
    expect(routeLabels({ shortName: 'SSSF', longName: 'Sausalito - San Francisco Ferry', routeType: 4 }).primary).toBe('SSSF');
    expect(routeLabels({ shortName: 'RWXP', longName: 'Ridgway Express', routeType: 3 }).text).toBe('RWXP — Ridgway Express');
  });
  it('keeps compass directions and US highway numbers in capitals', () => {
    expect(routeLabelCase('NW 5TH AVE')).toBe('NW 5th Ave');
    expect(routeLabelCase('US 41')).toBe('US 41');
    expect(routeLabelCase('SW BROADWAY')).toBe('SW Broadway');
    expect(routeLabelCase('NE')).toBe('NE');
    expect(routeLabelCase('WEST PARK')).toBe('West Park');
  });
  it('title-cases whole-string capitals from real feeds (SF Muni and similar)', () => {
    const cases: Array<[string, string]> = [
      ['CHURCH', 'Church'], ['INGLESIDE', 'Ingleside'], ['OCEAN VIEW', 'Ocean View'], ['EMBARCADERO STATION', 'Embarcadero Station'],
      ['PARK ST', 'Park St'], ['ST. CLAIR AVE', 'St. Clair Ave'], ['VAN NESS AVE', 'Van Ness Ave'],
      ['UNIVERSITY OF TORONTO', 'University of Toronto'], ['CALIFORNIA ST VIA THE HILL', 'California St via the Hill'],
      ["O'BRIEN", "O'Brien"], ['MCKNIGHT', 'McKnight'], ['OCEAN-VIEW', 'Ocean-View'], ['DOWNTOWN/AIRPORT (EXPRESS)', 'Downtown/Airport (Express)'],
      ['BART STATION', 'BART Station'], ['TTC EXPRESS', 'TTC Express'],
      ['WEST', 'West'], ['PARK', 'Park'], ['MAIN', 'Main'], ['CHURCH', 'Church'], ['OCEAN VIEW', 'Ocean View'], ['BART TO AIRPORT', 'BART to Airport'],
      ['UBC EXCHANGE/DOWNTOWN', 'UBC Exchange/Downtown'], ['SFO VIA JFK', 'SFO via JFK'], ['5TH AVE', '5th Ave'], ['SU 43', 'SU 43'], ['14R MISSION RAPID', '14R Mission Rapid'],
    ];
    for (const [raw, shown] of cases) expect(routeLabelCase(raw)).toBe(shown);
  });
  it('leaves mixed-case names, digit codes and allowlisted acronyms alone', () => {
    for (const same of ['N Judah', '14R Mission Rapid', 'Church', 'BART', 'TTC', 'UTSC', 'GO', 'Owl', '14R', 'L Taraval']) expect(routeLabelCase(same)).toBe(same);
  });
  it('keeps the added service-brand acronyms in capitals inside all-caps names (CIV-327)', () => {
    expect(routeLabelCase('MAX YELLOW LINE')).toBe('MAX Yellow Line');
    expect(routeLabelCase('UP EXPRESS')).toBe('UP Express');
    expect(routeLabelCase('PATH TO NEWARK')).toBe('PATH to Newark');
    expect(routeLabelCase('PATCO TO LINDENWOLD')).toBe('PATCO to Lindenwold');
    expect(routeLabelCase('MARC PENN LINE')).toBe('MARC Penn Line');
    expect(routeLabelCase('STO TO TERMINAL')).toBe('STO to Terminal');
    expect(routeLabelCase('TC LOOP')).toBe('TC Loop');
    expect(routeLabelCase('SU 43')).toBe('SU 43');
    expect(routeLabelCase('RT 5')).toBe('RT 5');
  });
  it('does not add the excluded short tokens to the acronym list (CIV-327)', () => {
    expect(routeLabelCase('MAIN ST')).toBe('Main St');
    for (const word of ['ID', 'MB', 'SH', 'VIVA', 'LINK', 'RAILLINK', 'METRO']) {
      expect(ROUTE_NAME_ACRONYMS.has(word)).toBe(false);
    }
  });
  it('title-cases a shouting long name on a route card', () => {
    expect(routeLabels({ shortName: 'J', longName: 'CHURCH', routeType: 0 }).text).toBe('J — Church');
  });
  it('gives the card title in title case and lists the cleaned names', () => {
    expect(routeLabels({ shortName: '961', longName: '757X - NORFOLK TO NNTC', routeType: 3 })).toMatchObject({ primary: '757X', secondary: 'Norfolk to NNTC', text: '757X — Norfolk to NNTC' });
    expect(routeLabels({ shortName: 'SL1', longName: 'Logan Airport Terminals - South Station', routeType: 3 })).toMatchObject({ primary: 'SL1', secondary: 'Logan Airport Terminals - South Station' });
  });
});

describe('fmtHeadway', () => {
  it('uses cautious wording for scheduled cadence', () => {
    expect(fmtHeadway(10)).toBe('every 10 min');
    expect(fmtHeadway(90)).toBe('every 90 min');
  });
});

describe('comparePanelTop', () => {
  it('keeps cards below the Compare labels and chips', () => {
    expect(comparePanelTop(true, false, '')).toBe(COMPARE_PANEL_TOP);
  });
  it('puts search suggestions and results straight under the search bar', () => {
    expect(comparePanelTop(true, true, '')).toBeNull();
    expect(comparePanelTop(true, true, 'Bloor')).toBeNull();
    expect(comparePanelTop(true, false, 'Bloor')).toBeNull();
  });
  it('leaves the normal slot alone outside Compare', () => {
    expect(comparePanelTop(false, false, '')).toBeNull();
    expect(comparePanelTop(false, true, 'Bloor')).toBeNull();
  });
});

describe('names in capitals with French linking words (CIV-1054)', () => {
  it('cases STO names whose only small letters are linking words, keeping those words as written', () => {
    expect(stopNameCase('SPORTHÈQUE')).toBe('Sporthèque');
    expect(stopNameCase('SAINT-LOUIS/de NANTEL')).toBe('Saint-Louis/de Nantel');
    expect(stopNameCase('FREEMAN/du TALUS')).toBe('Freeman/du Talus');
    expect(stopNameCase('des ALLUMETTIÈRES/BROAD')).toBe('des Allumettières/Broad');
    expect(stopNameCase("du PRADO/de l'ACROPOLE")).toBe("du Prado/de l'Acropole");
    expect(routeLabelCase("de L'AMÉRIQUE-FRANÇAISE")).toBe("de l'Amérique-Française");
  });

  it('cases French elisions and hyphenated linking words in names sent in capitals', () => {
    expect(stopNameCase("JEANNE D'ARC / ST JOSEPH")).toBe("Jeanne d'Arc / St Joseph");
    expect(stopNameCase('STATION CÔTE-DES-NEIGES')).toBe('Station Côte-des-Neiges');
    expect(stopNameCase("STATION LUCIEN-L'ALLIER")).toBe("Station Lucien-L'Allier");
    expect(stopNameCase("L'ACADIE")).toBe("L'Acadie");
    expect(stopNameCase('SECAUCUS CUL-DE-SAC')).toBe('Secaucus Cul-de-Sac');
    // D'Arcy is a surname, not "de Arcy"; a feed's own mixed-case "D'" stays as written.
    expect(stopNameCase("LA VÉRENDRYE / THOMAS D'ARCY MCGEE SCHOOL")).toBe("La Vérendrye / Thomas D'Arcy McGee School");
    expect(titleCase("Thomas D'Arcy McGee")).toBe("Thomas D'Arcy McGee");
    expect(titleCase("Rue D'Anjou")).toBe("Rue D'Anjou");
  });

  it('leaves names that are really mixed case, and English names with small words, as the feed wrote them', () => {
    expect(stopNameCase('Saint-Joseph/Jean-Proulx')).toBe('Saint-Joseph/Jean-Proulx');
    expect(stopNameCase('Granville-YVR')).toBe('Granville-YVR');
    expect(routeLabelCase('Kendall/MIT Station')).toBe('Kendall/MIT Station');
  });
});

describe('route-name acronyms from the feeds (CIV-984)', () => {
  it('keeps college, hospital and service acronyms in all-caps route names, and title-cases real words', () => {
    expect(routeLabels({ shortName: '', longName: 'USI', mode: 3, agencyName: 'METS' }).text).toBe('USI');
    expect(routeLabelCase('THIBODAUX/NSU INBOUND')).toBe('Thibodaux/NSU Inbound');
    expect(routeLabelCase('LYNNHAVEN MALL/TCC VB')).toBe('Lynnhaven Mall/TCC VB');
    expect(routeLabelCase('Q70-SBS')).toBe('Q70-SBS');
    expect(routeLabelCase('COASTER')).toBe('Coaster');
    expect(routeLabelCase('EAGLE MTN/SARATOGA SPR/LEHI STN/UVU')).toBe('Eagle Mtn/Saratoga Spr/Lehi Stn/UVU');
  });
});

// CIV-1166: a name in capitals apart from its connectors counts as sent in capitals.
describe('names in capitals with lower-case connectors (CIV-1166)', () => {
  it('cases them like an all-capitals name', () => {
    expect(stopNameCase('STERLING at HADDON')).toBe('Sterling at Haddon');
    expect(stopNameCase('ABERDEEN opposite CHEDOKE')).toBe('Aberdeen opposite Chedoke');
    expect(stopNameCase('At 100 MACKLIN')).toBe('At 100 Macklin');
    expect(stopNameCase('to LAKE DR - NORTH AVE.')).toBe('to Lake Dr - North Ave.');
    expect(stopNameCase('SEACREST BLVD at MINER RD')).toBe('Seacrest Blvd at Miner Rd');
    // Road codes keep their capitals; ordinals read small (NJ Transit, Palm Tran).
    expect(stopNameCase('US-9W at CHARLOTTE PL')).toBe('US-9W at Charlotte Pl');
    expect(stopNameCase('SR-7 at 10TH AVE N')).toBe('SR-7 at 10th Ave N');
    expect(stopNameCase('49 A1A')).toBe('49 A1A');
    // Compass points, directions and initials keep their capitals; street abbreviations and possessives read as words.
    expect(stopNameCase('EB 86 AV SE @ W. of 60 ST SE')).toBe('EB 86 Av SE @ W. of 60 St SE');
    expect(stopNameCase('OKEECHOBEE BLVD at WPB')).toBe('Okeechobee Blvd at WPB');
    expect(stopNameCase('EXPRESS to RVH')).toBe('Express to RVH');
    expect(stopNameCase("ST MARY'S HOSPITAL")).toBe("St Mary's Hospital");
    expect(stopNameCase("AVALON WAY 72'S OF QUAKERBRIDGE RD")).toBe("Avalon Way 72'S of Quakerbridge Rd");
  });
  it('leaves the feed spelling of mixed-case names and initials alone', () => {
    expect(stopNameCase('Main St After Bay')).toBe('Main St After Bay');
    expect(stopNameCase('At Home Depot')).toBe('At Home Depot');
    expect(stopNameCase('U Of A')).toBe('U Of A');
    expect(stopNameCase('At')).toBe('At');
    expect(stopNameCase('54B')).toBe('54B');
  });
});
