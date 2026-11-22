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

  it('keeps the order of the slugs given, each once, and skips agencies not in the list', () => {
    const agencies = [
      { slug: 'x', name: 'X', dataLicense: lic('required') },
      { slug: 'y', name: 'Y', dataLicense: lic('none') },
      { slug: 'z', name: 'Z', dataLicense: lic('required') },
    ];
    expect(agencyCredits(agencies, ['z', 'y', 'x', 'z', 'nope']).map(c => c.slug)).toEqual(['z', 'x']);
    expect(agencyCredits(agencies).map(c => c.slug)).toEqual(['x', 'z']);
  });

  it('credits every agency the public catalog marks as requiring it, read from the config, no list of its own', () => {
    const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as { agencies: AgencyCatalogEntry[] };
    const required = catalog.agencies.filter(a => a.dataLicense?.attribution === 'required');
    expect(required.length).toBeGreaterThan(0);
    expect(agencyCredits(catalog.agencies).map(c => c.slug)).toEqual(required.map(a => a.slug));
  });
});
