import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { agencyCredit, agencyCredits } from '../agencyCredits';
import { scheduleDataCredit } from '../../content/noticeCopy';
import type { AgencyCatalogEntry } from '../../../shared/agencyCatalog';

const lic = (attribution: 'required' | 'optional' | 'none' | 'unread', extra: { name?: string; credit?: string } = {}) =>
  ({ url: 'https://example.org/licence', attribution, checkedOn: '2026-11-21', ...extra });

describe('agencyCredits (CIV-461)', () => {
  it("uses the licence's own sentence verbatim, else the MassDOT-style line; none unless credit is required", () => {
    expect(agencyCredit({ slug: 'a', name: 'A Transit', dataLicense: lic('required', { credit: 'Their own words.' }) })?.text).toBe('Their own words.');
    expect(agencyCredit({ slug: 'b', name: 'B Transit', dataLicense: lic('required', { name: 'CC BY 4.0' }) })?.text).toBe(scheduleDataCredit('B Transit', 'CC BY 4.0'));
    for (const a of ['optional', 'none', 'unread'] as const) expect(agencyCredit({ slug: 'c', name: 'C', dataLicense: lic(a) })).toBeNull();
    expect(agencyCredit({ slug: 'd', name: 'D' })).toBeNull();
  });

  it("gives Schedule sources' pill the lists' name and place, and the licence name and required words for when it opens", () => {
    const ttc = agencyCredit({ slug: 'ttc', name: 'Toronto Transit Commission', cities: ['Toronto, ON'], dataLicense: lic('required', { name: 'Open Government Licence – Toronto', credit: 'Contains information.' }) });
    expect(ttc?.label).toEqual({ primary: 'TTC', secondary: 'Toronto' });
    expect(ttc?.licenceName).toBe('Open Government Licence – Toronto');
    expect(ttc?.words).toBe('Contains information.');
    expect(agencyCredit({ slug: 'b', name: 'B Transit', dataLicense: lic('required', { name: 'CC BY 4.0' }) })?.words).toBeNull();
  });

  it("ends with the data's last-updated date in the licence's own words where it asks for one (STO)", () => {
    const sto = { slug: 'sto', name: 'STO (Gatineau)', lastRefreshedAt: '2026-11-16', dataLicense: { ...lic('required', { credit: 'Le présent service intègre les données.' }), updatedLabel: 'Dernière mise à jour :' } };
    expect(agencyCredit(sto)?.text).toBe('Le présent service intègre les données. Dernière mise à jour : 2026-11-16.');
    expect(agencyCredit(sto)?.words).toBe('Le présent service intègre les données. Dernière mise à jour : 2026-11-16.');
    expect(agencyCredit({ ...sto, lastRefreshedAt: null })?.text).toBe('Le présent service intègre les données.');
  });

  it('credits 511.org for an agency read through the 511 API, alone or after its own licence (#1692)', () => {
    const samtrans = agencyCredit({ slug: 'samtrans', name: 'SamTrans', feedCredit: '511', dataLicense: lic('none') });
    expect(samtrans?.feedLink).toEqual({ href: 'https://511.org/', text: 'Powered by 511.org' });
    expect(samtrans?.licenceName).toBeNull();
    expect(agencyCredit({ slug: 'ace', name: 'ACE', feedCredit: '511' })?.text).toBe('Powered by 511.org');
    const sfmta = agencyCredit({ slug: 'sfmta', name: 'SFMTA', feedCredit: '511', dataLicense: lic('required', { name: 'SFMTA licence', credit: 'Reproduced with permission.' }) });
    expect(sfmta?.words).toBe('Reproduced with permission.');
    expect(sfmta?.feedLink?.text).toBe('Powered by 511.org');
    expect(agencyCredit({ slug: 'x', name: 'X', dataLicense: lic('required') })?.feedLink).toBeNull();
  });

  it('keeps the order of the slugs given, each once, and skips agencies not in the list', () => {
    const agencies = [
      { slug: 'x', name: 'X', dataLicense: lic('required') },
      { slug: 'y', name: 'Y', dataLicense: lic('none') },
      { slug: 'z', name: 'Z', dataLicense: lic('required') },
    ];
    expect(agencyCredits(agencies, ['z', 'y', 'x', 'z', 'nope']).map(c => c.slug)).toEqual(['z', 'x']);
    expect(agencyCredits(agencies).map(c => c.slug)).toEqual(['x', 'z']);
  });

  it('credits every agency the public catalog marks as requiring it (by its licence, or by its feed publisher: #1692), read from the config, no list of its own', () => {
    const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as { agencies: AgencyCatalogEntry[] };
    const required = catalog.agencies.filter(a => a.dataLicense?.attribution === 'required' || a.feedCredit);
    expect(required.length).toBeGreaterThan(0);
    expect(agencyCredits(catalog.agencies).map(c => c.slug)).toEqual(required.map(a => a.slug));
  });
});
