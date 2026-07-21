import { describe, expect, it } from 'vitest';
import { cleanHeadsign, getRouteLabel, isMiwayExpressHeadsign } from '../cleanHeadsign';

describe('cleanHeadsign', () => {
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
});
