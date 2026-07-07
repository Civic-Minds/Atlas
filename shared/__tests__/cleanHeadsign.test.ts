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
