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

  it('uses short brand for long legal names, paired with the place buried in the legal name', () => {
    expect(agencyDisplayParts('Bay Area Rapid Transit (BART)')).toEqual({
      primary: 'BART',
      secondary: 'Bay Area',
    });
    // SF riders say "Muni", not "SFMTA" — the agency vs. the service brand.
    expect(
      agencyDisplayParts('San Francisco Municipal Transportation Agency (SFMTA - Muni)'),
    ).toEqual({ primary: 'Muni', secondary: 'San Francisco' });
    expect(
      agencyDisplayParts('Alameda-Contra Costa Transit District (AC Transit)'),
    ).toEqual({ primary: 'AC Transit', secondary: 'Alameda-Contra Costa' });
    expect(
      agencyDisplayParts('Santa Clara Valley Transportation Authority (VTA)'),
    ).toEqual({ primary: 'VTA', secondary: 'Santa Clara Valley' });
  });

  it('keeps expanded * Transit Service names in full when they fit a list row', () => {
    expect(agencyDisplayParts('Edmonton Transit Service (ETS)')).toEqual({
      primary: 'Edmonton Transit Service',
    });
    expect(agencyDisplayParts('Sonoma County Transit (SCT)')).toEqual({
      primary: 'Sonoma County Transit',
    });
    // Fits under the row threshold even with "Authority"/"District" in the name.
    expect(agencyDisplayParts('Chicago Transit Authority (CTA)')).toEqual({
      primary: 'Chicago Transit Authority',
    });
    expect(agencyDisplayParts('Utah Transit Authority (UTA)')).toEqual({
      primary: 'Utah Transit Authority',
    });
  });

  it('surfaces the place when a bare legal name (no parenthetical) has to shorten', () => {
    expect(agencyDisplayParts('Rochester-Genesee Regional Transportation Authority')).toEqual({
      primary: 'RGRTA',
      secondary: 'Rochester-Genesee',
    });
    expect(agencyDisplayParts('Regional Transportation Commission of Southern Nevada (RTC)')).toEqual({
      primary: 'RTC',
      secondary: 'Southern Nevada',
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

  it('prefers a GTFS-derived cities list over name-parsing heuristics', () => {
    expect(agencyDisplayParts('Metra', ['Chicago, Illinois'])).toEqual({
      primary: 'Metra',
      secondary: 'Chicago',
    });
    // Still skips the secondary when the derived city is already spelled out in the name.
    expect(agencyDisplayParts('Calgary Transit', ['Calgary, Alberta'])).toEqual({
      primary: 'Calgary Transit',
    });
    // No cities data (or empty) falls back to the name-parsing behavior untouched.
    expect(agencyDisplayParts('Metra', [])).toEqual({ primary: 'Metra' });
    expect(agencyDisplayParts('Metra')).toEqual({ primary: 'Metra' });
  });
});
