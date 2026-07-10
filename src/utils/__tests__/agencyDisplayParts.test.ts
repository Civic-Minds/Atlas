import { describe, expect, it } from 'vitest';
import { agencyDisplayParts } from '../format';

describe('agencyDisplayParts', () => {
  it('leaves plain names alone', () => {
    expect(agencyDisplayParts('TransLink')).toEqual({ primary: 'TransLink' });
    expect(agencyDisplayParts('Calgary Transit')).toEqual({ primary: 'Calgary Transit' });
  });

  it('splits system + place into primary · secondary', () => {
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
  });

  it('keeps short brand + acronym as primary · code', () => {
    expect(agencyDisplayParts('Edmonton Transit (ETS)')).toEqual({
      primary: 'Edmonton Transit',
      secondary: 'ETS',
    });
  });

  it('leads with brand code for long legal names', () => {
    expect(agencyDisplayParts('Bay Area Rapid Transit (BART)')).toEqual({
      primary: 'BART',
    });
    expect(
      agencyDisplayParts('San Francisco Municipal Transportation Agency (SFMTA - Muni)'),
    ).toEqual({ primary: 'SFMTA' });
  });
});
