import { describe, expect, it } from 'vitest';
import { agencyNameParts, agencyNames } from '../format';

// CIV-998 step 1: every form of an agency's name from one place, with the same output as before.
describe('agencyNames', () => {
  it('gives the short, back-link, full and place forms', () => {
    // CIV-998 step 2: `name` is never a city; `short` keeps the older form for Live only.
    expect(agencyNames({ name: 'Valley Metro (Phoenix)' })).toEqual({ name: 'Valley Metro', short: 'Phoenix', backLink: 'Valley Metro', full: 'Valley Metro', place: 'Phoenix' });
    expect(agencyNames('Toronto Transit Commission')).toMatchObject({ name: 'TTC', short: 'TTC', backLink: 'TTC', full: 'Toronto Transit Commission' });
  });

  it('gives list rows their { primary, secondary } shape', () => {
    expect(agencyNameParts('MiWay (Mississauga)')).toEqual({ primary: 'MiWay', secondary: 'Mississauga' });
  });
});
