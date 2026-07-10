import { describe, expect, it } from 'vitest';
import { agencyDisplayParts } from '../format';

describe('agencyDisplayParts', () => {
  it('leaves plain names alone', () => {
    expect(agencyDisplayParts('TransLink')).toEqual({ primary: 'TransLink' });
    expect(agencyDisplayParts('Calgary Transit')).toEqual({ primary: 'Calgary Transit' });
  });

  it('uses secondary only for place / sector disambiguation', () => {
    expect(agencyDisplayParts('BC Transit (Kelowna)')).toEqual({
      primary: 'BC Transit',
      secondary: 'Kelowna',
    });
    expect(agencyDisplayParts('BC Transit (South Okanagan-Similkameen)')).toEqual({
      primary: 'BC Transit',
      secondary: 'South Okanagan-Similkameen',
    });
    expect(agencyDisplayParts('MiWay (Mississauga)')).toEqual({
      primary: 'MiWay',
      secondary: 'Mississauga',
    });
    expect(agencyDisplayParts('DDOT (Detroit)')).toEqual({
      primary: 'DDOT',
      secondary: 'Detroit',
    });
    expect(agencyDisplayParts("exo (La Presqu'île)")).toEqual({
      primary: 'exo',
      secondary: "La Presqu'île",
    });
    expect(agencyDisplayParts('exo (Trains)')).toEqual({
      primary: 'exo',
      secondary: 'Trains',
    });
    // Province abbrev is a place, not a brand code
    expect(agencyDisplayParts('T3 Transit (PEI)')).toEqual({
      primary: 'T3 Transit',
      secondary: 'PEI',
    });
  });

  it('never shows acronym as secondary — one brand only', () => {
    // Everyday callsign
    expect(agencyDisplayParts('Edmonton Transit Service (ETS)')).toEqual({ primary: 'ETS' });
    expect(agencyDisplayParts('Edmonton Transit (ETS)')).toEqual({ primary: 'ETS' });
    expect(agencyDisplayParts('Bay Area Rapid Transit (BART)')).toEqual({ primary: 'BART' });
    expect(
      agencyDisplayParts('San Francisco Municipal Transportation Agency (SFMTA - Muni)'),
    ).toEqual({ primary: 'SFMTA' });
    // Public brand already short — drop legal acronym
    expect(agencyDisplayParts('County Connection (CCCTA)')).toEqual({
      primary: 'County Connection',
    });
  });
});
