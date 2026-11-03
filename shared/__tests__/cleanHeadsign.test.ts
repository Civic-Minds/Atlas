import { describe, expect, it } from 'vitest';
import { cleanHeadsign, isMiwayExpressHeadsign } from '../cleanHeadsign';
import { getRouteLabel } from '../routeDisplay';

describe('cleanHeadsign', () => {
  it('removes NJ Transit fare instructions from destination headsigns', () => {
    expect(cleanHeadsign('31 VAILSBURG S ORANGE-Exact Fare', '31', null)).toBe('VAILSBURG S ORANGE');
    expect(cleanHeadsign('31 VAILSBURG DOVER ST LOOP-Exact Fare', '31', null)).toBe('VAILSBURG DOVER ST LOOP');
  });

  it('keeps TTC station destination when it shares the route long name', () => {
    const hs = 'South - 68 Warden towards Warden Station';
    expect(cleanHeadsign(hs, '68', 'Warden')).toBe('Warden Station');
  });

  it('still strips Station for unrelated destinations', () => {
    const hs = 'North - 68A Warden towards Steeles';
    expect(cleanHeadsign(hs, '68', 'Warden')).toBe('Steeles');
  });

  it('does not return empty for bare route long name (redundancy is display-time)', () => {
    expect(cleanHeadsign('Warden', '68', 'Warden')).toBe('Warden');
  });

  it('clears MiWay express headsigns that encode direction, not destination', () => {
    expect(cleanHeadsign('135 E Express Eglinton Exp', '135', 'Eglinton Express')).toBe('');
    expect(cleanHeadsign('101 W Express Dundas Exp', '101', 'Dundas Express')).toBe('');
    expect(cleanHeadsign('110 Express University Exp', '110', 'University Express')).toBe('');
  });

  it('still extracts MiWay local route destinations', () => {
    expect(cleanHeadsign('57 E Courtneypark To Renforth Station', '57', 'Courtneypark')).toBe('Renforth');
  });

  it('strips MVTA 4FUN directional prefixes', () => {
    expect(cleanHeadsign('4FUN East to MOA/MSP', '495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('MOA/MSP');
    expect(cleanHeadsign('4FUN West to Marschall Road TS', '495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('Marschall Road TS');
    expect(cleanHeadsign('4FUN East Mystic Lake to MOA/MSP', '495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('MOA/MSP');
  });

  it('strips repeated Calgary MAX branding from destinations', () => {
    expect(cleanHeadsign('MAX GREEN CITY CENTRE', 'MG', 'MAX Green North Pointe/ City Centre')).toBe('CITY CENTRE');
    expect(cleanHeadsign('MAX GREEN NORTH POINTE', 'MG', 'MAX Green North Pointe/ City Centre')).toBe('NORTH POINTE');
  });

  it('merges Lyon ZI8\'s orphaned un-accented headsign variant into the real pattern', () => {
    expect(cleanHeadsign('Parc des Lumieres', 'ZI8', null)).toBe('Parc des Lumières 1');
    expect(cleanHeadsign('Parc des Lumières 1', 'ZI8', null)).toBe('Parc des Lumières 1');
  });

  it('merges Nice 69\'s inconsistent-accent headsign variants into one canonical form', () => {
    expect(cleanHeadsign('Leï Feirriero', '69', null)).toBe('Lei Feirrièro');
    expect(cleanHeadsign('Lei Feirrièro', '69', null)).toBe('Lei Feirrièro');
  });

  it('merges ALL-CAPS/no-accent headsign variants found across TBM Bordeaux, le Mans, Izilo Lorient, and Qub Quimper', () => {
    const pairs: [string, string, string][] = [
      ['A', 'SAINTE CATHERINE', 'Ste Catherine'],
      ['B', 'de la Garonne', 'DE GARONNE'],
      ['C', 'Gare de Bègles', 'GARE DE BEGLES'],
      ['23', 'LE BOUSCAT Hippodrome', 'BOUSCAT HIPPODROME'],
      ['26', 'MERIGNAC Lycée Daguin', 'MERIGNAC LY. DAGUIN'],
      ['27', 'LORMONT Buttinière', 'LORMONT BUTTINIERE'],
      ['29', 'SAINT LOUIS Belle Rive', 'ST LOUIS BELLE RIVE'],
      ['39', 'VILLENAVE Pyrénées', 'VILLENAVE PYRENEES'],
      ['74', 'GRADIGNAN Stade Ornon', 'GRADIGNAN ST. ORNON'],
      ['80', 'BORDEAUX République', 'BORDEAUX REPUBLIQUE'],
      ['25', 'REPUBLIQUE', 'République'],
      ['31', 'Parc des Exposition', 'Parc des Expositions'],
      ['B3', 'Ste Catherine', 'Sainte Catherine'],
      ['5', 'Z.A. Petit Guelen', 'Petit Guelen'],
    ];
    for (const [route, a, b] of pairs) {
      expect(cleanHeadsign(a, route, null)).toBe(cleanHeadsign(b, route, null));
    }
  });

  it('does not merge near-duplicate-looking headsigns that are actually different destinations', () => {
    // Orléans: different platform letters, not a typo.
    expect(cleanHeadsign('Léon Blum - Quai E', '2', null)).not.toBe(cleanHeadsign('Léon Blum - Quai C', '2', null));
    // Saint-Nazaire: different real origin towns feeding the same terminus.
    expect(cleanHeadsign('Redon > Saint-Nazaire', '305', null)).not.toBe(cleanHeadsign('Besné > Saint-Nazaire', '305', null));
  });

  it('strips the unpadded route number when the short name is zero-padded (#1098)', () => {
    expect(cleanHeadsign('5  LOVE FIELD AIRPORT', '005', 'LOVE FIELD SHUTTLE')).toBe('LOVE FIELD AIRPORT');
    expect(cleanHeadsign('4 Downtown', '004', null)).toBe('Downtown');
    expect(cleanHeadsign('9 Wilmington - Bowers & 12th Sts', '009', null)).toBe('Wilmington - Bowers & 12th Sts');
  });

  it('keeps a first word that only starts with the route number or letter (#1139)', () => {
    expect(cleanHeadsign('12th Street/31st & Van Brunt', '12', null)).toBe('12th Street/31st & Van Brunt');
    expect(cleanHeadsign('63rd St/67th & Blue Ridge', '63', null)).toBe('63rd St/67th & Blue Ridge');
    expect(cleanHeadsign('211', '21', null)).toBe('211');
    expect(cleanHeadsign('AMERICAN CENTER', 'A', null)).toBe('AMERICAN CENTER');
    expect(cleanHeadsign('BIG BEND - NORTHBOUND', 'B', null)).toBe('BIG BEND - NORTHBOUND');
    expect(cleanHeadsign('UC Davis MU Terminal', 'U', null)).toBe('UC Davis MU Terminal');
  });

  it('still strips the route number and its variant letter when they open the headsign (#1139)', () => {
    expect(cleanHeadsign('54S Lawrence East Short Turn', '54', null)).toBe('Lawrence East Short Turn');
    expect(cleanHeadsign('504 King', '504', null)).toBe('King');
    expect(cleanHeadsign('31 - Downtown', '31', null)).toBe('Downtown');
    expect(cleanHeadsign('A Downtown', 'A', null)).toBe('Downtown');
  });

  it('keeps a leading number that is not the unpadded route number', () => {
    expect(cleanHeadsign('50 Waterfront Station', '005', null)).toBe('50 Waterfront Station');
    expect(cleanHeadsign('5th Street', '005', null)).toBe('5th Street');
    expect(cleanHeadsign('29th Ave Station', '029', null)).toBe('29th Ave Station');
  });

  it('closes a lone slash followed by a space (#1098)', () => {
    expect(cleanHeadsign('5 INWOOD/ LOVE FIELD STATION', '005', 'LOVE FIELD SHUTTLE')).toBe('INWOOD/LOVE FIELD STATION');
    expect(cleanHeadsign('Parkrose/ Sumner Transit Center', '12', null)).toBe('Parkrose/Sumner Transit Center');
  });

  it('leaves evenly spaced slashes and multi-slash lists alone', () => {
    expect(cleanHeadsign('JB JACKSON TC / MLK JR STATION', '104', null)).toBe('JB JACKSON TC / MLK JR STATION');
    expect(cleanHeadsign('Main St/ Wicks/ Lk Elmo/ 6th Ave N/ Downtown', '16', null)).toBe('Main St/ Wicks/ Lk Elmo/ 6th Ave N/ Downtown');
  });
});

describe('getRouteLabel', () => {
  it('uses branded short name for MVTA 4FUN corridor routes', () => {
    expect(getRouteLabel('495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP')).toBe('495 — 4FUN');
  });
});

describe('isMiwayExpressHeadsign', () => {
  it('detects express route branding headsigns', () => {
    expect(isMiwayExpressHeadsign('135 W Express Eglinton Exp')).toBe(true);
    expect(isMiwayExpressHeadsign('110 Express University Exp')).toBe(true);
    expect(isMiwayExpressHeadsign('57 E Courtneypark To Renforth Station')).toBe(false);
  });

  it('keeps a hyphenated place name whole: REM "Bois-Franc", not "Franc" (CIV-1146)', () => {
    expect(cleanHeadsign('Bois-Franc', 'S2', 'A1')).toBe('Bois-Franc');
    expect(cleanHeadsign('Saint-Jérôme')).toBe('Saint-Jérôme');
    expect(cleanHeadsign('Kippa-Ring station')).toBe('Kippa-Ring station');
    expect(cleanHeadsign('Vieux-Québec (Sud)')).toBe('Vieux-Québec (Sud)');
    expect(cleanHeadsign('15th-Market')).toBe('15th-Market');
  });

  it('still strips a branch or direction prefix, spaced or a code in capitals (CIV-1146)', () => {
    expect(cleanHeadsign('A - Oshawa Centre')).toBe('Oshawa Centre');
    expect(cleanHeadsign('KI - Kitchener GO')).toBe('Kitchener GO');
    expect(cleanHeadsign('East - Kennedy Station')).toBe('Kennedy Station');
    expect(cleanHeadsign('601-SYCAMORE')).toBe('SYCAMORE');
    expect(cleanHeadsign('WELL-Express')).toBe('Express');
    // Only the first prefix goes: the second "HUB - " stays.
    expect(cleanHeadsign('51 - HUB - GRAHAM PARK RD')).toBe('HUB - GRAHAM PARK RD');
  });

  it('reads REM headsigns whole, and leaves other agencies\' Orme, Brossard and Deux-Montagnes names alone (CIV-1153)', () => {
    expect(cleanHeadsign('A1 - Brossard', 'A4-A1', 'A4 - Deux-Montagnes / A1 - Brossard')).toBe('Brossard');
    expect(cleanHeadsign('A4 - Deux-Montagnes', 'A4-A1', 'A4 - Deux-Montagnes / A1 - Brossard')).toBe('Deux-Montagnes');
    expect(cleanHeadsign("A3 - Anse-à-l'Orme", 'A3-A1', "A3 - Anse-à-l'Orme / A1 - Brossard")).toBe("Anse-à-l'Orme");
    expect(cleanHeadsign('Bois-Franc', 'A1', 'Bois-Franc / A1 - Brossard')).toBe('Bois-Franc');
    expect(cleanHeadsign('Les Ormes')).toBe('Les Ormes');
    expect(cleanHeadsign('Purmerend via Wormerveer')).toBe('Purmerend via Wormerveer');
    expect(cleanHeadsign('Ormeau station')).toBe('Ormeau station');
    expect(cleanHeadsign('Terminus Brossard')).toBe('Terminus Brossard');
    expect(cleanHeadsign('Station Deux-Montagnes')).toBe('Station Deux-Montagnes');
  });
});

describe('the literal word "Destination" (exo, STM)', () => {
  it('goes with its spaces, so no double space is left (CIV-1154)', () => {
    expect(cleanHeadsign("Ouest Destination Anse-à-l'Orme / Timberlea-Trail", '68', null)).toBe("Ouest Anse-à-l'Orme / Timberlea-Trail");
    expect(cleanHeadsign('Est destination Station Snowdon', '51', null)).toBe('Est Station Snowdon');
    expect(cleanHeadsign('Destination Gare Centrale', null, null)).toBe('Gare Centrale');
  });
});
