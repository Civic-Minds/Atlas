import { describe, expect, it } from 'vitest';
import { agencyDisplayParts } from '../format';

describe('agencyDisplayParts', () => {
  it('leaves plain names alone (place often already in the name)', () => {
    expect(agencyDisplayParts('TransLink')).toEqual({ primary: 'TransLink' });
    expect(agencyDisplayParts('Calgary Transit')).toEqual({ primary: 'Calgary Transit' });
    expect(agencyDisplayParts('Winnipeg Transit')).toEqual({ primary: 'Winnipeg Transit' });
  });

  it('primary is agency; secondary is place only when missing from the name', () => {
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
    expect(agencyDisplayParts('T3 Transit (PEI)')).toEqual({
      primary: 'T3 Transit',
      secondary: 'PEI',
    });
  });

  it('uses short brand for long legal names (list-friendly)', () => {
    expect(agencyDisplayParts('Bay Area Rapid Transit (BART)')).toEqual({ primary: 'BART' });
    expect(
      agencyDisplayParts('San Francisco Municipal Transportation Agency (SFMTA - Muni)'),
    ).toEqual({ primary: 'SFMTA' });
    expect(
      agencyDisplayParts('Alameda-Contra Costa Transit District (AC Transit)'),
    ).toEqual({ primary: 'AC Transit' });
    expect(
      agencyDisplayParts('Santa Clara Valley Transportation Authority (VTA)'),
    ).toEqual({ primary: 'VTA' });
  });

  it('keeps expanded * Transit Service names in full when they fit a list row', () => {
    expect(agencyDisplayParts('Edmonton Transit Service (ETS)')).toEqual({
      primary: 'Edmonton Transit Service',
    });
    expect(agencyDisplayParts('Sonoma County Transit (SCT)')).toEqual({
      primary: 'Sonoma County Transit',
    });
  });

  it('keeps short public brands; drops legal acronym only', () => {
    expect(agencyDisplayParts('County Connection (CCCTA)')).toEqual({
      primary: 'County Connection',
    });
  });

  it('skips place secondary when already in the agency name', () => {
    expect(agencyDisplayParts('Kelowna Transit (Kelowna)')).toEqual({
      primary: 'Kelowna Transit',
    });
  });
});
