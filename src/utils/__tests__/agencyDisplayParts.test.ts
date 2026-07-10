import { describe, expect, it } from 'vitest';
import { agencyDisplayParts } from '../format';

describe('agencyDisplayParts', () => {
  it('leaves plain names alone (place often already in the name)', () => {
    expect(agencyDisplayParts('TransLink')).toEqual({ primary: 'TransLink' });
    expect(agencyDisplayParts('Calgary Transit')).toEqual({ primary: 'Calgary Transit' });
    expect(agencyDisplayParts('Winnipeg Transit')).toEqual({ primary: 'Winnipeg Transit' });
  });

  it('primary is always the agency; secondary is place only when missing from the name', () => {
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
    expect(agencyDisplayParts('T3 Transit (PEI)')).toEqual({
      primary: 'T3 Transit',
      secondary: 'PEI',
    });
  });

  it('drops acronyms and skips place when already in the agency name', () => {
    expect(agencyDisplayParts('Edmonton Transit Service (ETS)')).toEqual({
      primary: 'Edmonton Transit Service',
    });
    expect(agencyDisplayParts('Edmonton Transit (ETS)')).toEqual({
      primary: 'Edmonton Transit',
    });
    expect(agencyDisplayParts('Bay Area Rapid Transit (BART)')).toEqual({
      primary: 'Bay Area Rapid Transit',
    });
    expect(
      agencyDisplayParts('San Francisco Municipal Transportation Agency (SFMTA - Muni)'),
    ).toEqual({ primary: 'San Francisco Municipal Transportation Agency' });
    expect(agencyDisplayParts('County Connection (CCCTA)')).toEqual({
      primary: 'County Connection',
    });
    // Hypothetical: place duplicated in name
    expect(agencyDisplayParts('Kelowna Transit (Kelowna)')).toEqual({
      primary: 'Kelowna Transit',
    });
  });
});
