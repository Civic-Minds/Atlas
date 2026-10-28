import { describe, expect, it } from 'vitest';
import { agencyNames, fitAgencyName } from '../agencyName';

// CIV-998 step 1: every form of an agency's name from one place, with the same output as before.
describe('agencyNames', () => {
  it('gives the short, back-link, full and place forms', () => {
    // CIV-998 step 2: `name` is never a city; `short` keeps the older form for Live only.
    expect(agencyNames({ name: 'Valley Metro (Phoenix)' })).toEqual({ name: 'Valley Metro', short: 'Phoenix', backLink: 'Valley Metro', full: 'Valley Metro', place: 'Phoenix', card: { primary: 'Valley Metro', secondary: 'Phoenix' }, list: { primary: 'Valley Metro', secondary: 'Phoenix' } });
    expect(agencyNames('Toronto Transit Commission')).toMatchObject({ name: 'TTC', short: 'TTC', backLink: 'TTC', full: 'Toronto Transit Commission' });
  });

  it('gives list rows their { primary, secondary } shape', () => {
    expect(agencyNames('MiWay (Mississauga)').card).toEqual({ primary: 'MiWay', secondary: 'Mississauga' });
  });
});

describe('fitAgencyName: the one length rule (CIV-967, CIV-1023)', () => {
  it('keeps a name that fits, with no hover title', () => {
    expect(fitAgencyName('Marin Transit', 'Marin Transit')).toEqual({ text: 'Marin Transit' });
  });
  it('shows the short name past the limit, with the full name on hover', () => {
    expect(fitAgencyName('Capital District Transportation Authority', 'CDTA')).toEqual({ text: 'CDTA', title: 'Capital District Transportation Authority' });
  });
  it('keeps the full name when the short one is no shorter', () => {
    expect(fitAgencyName('Spokane Transit Authority', 'Spokane Transit Authority')).toEqual({ text: 'Spokane Transit Authority' });
  });
  it('takes a surface width only where its layout needs one (the area table: 55)', () => {
    expect(fitAgencyName('Capital District Transportation Authority', 'CDTA', 55)).toEqual({ text: 'Capital District Transportation Authority' });
  });
});
