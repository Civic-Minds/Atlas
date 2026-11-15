import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agencyCardTitle } from '../agencyName';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
const catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/index.json'), 'utf8')) as
  Array<{ slug: string; name: string; cities?: string[]; displayArea?: string; region?: string }> | { agencies: Array<{ slug: string; name: string; cities?: string[]; displayArea?: string; region?: string }> };
const agencies = Array.isArray(catalog) ? catalog : catalog.agencies;

describe('agency card place name: one source for the map and History (CIV-1428, #1027)', () => {
  it('both views take the card title from agencyCardTitle and neither builds its own', () => {
    for (const file of ['components/Interval/AgencyCard.tsx', 'apps/History.tsx']) {
      const text = src(file);
      expect(text, file).toMatch(/agencyCardTitle\(/);
      expect(text, file).not.toMatch(/agencyNames\([^)]*\)\.card\b/);
      expect(text, file).not.toMatch(/\.region\b[^\n]*place=/);
    }
  });

  it('names the city, not the state: MARTA is Atlanta', () => {
    const marta = agencies.find(a => a.slug === 'marta');
    expect(marta).toBeDefined();
    expect(agencyCardTitle(marta!).secondary).toBe('Atlanta');
  });
});
