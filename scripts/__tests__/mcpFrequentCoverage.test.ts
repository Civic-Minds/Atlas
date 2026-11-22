import { describe, expect, it } from 'vitest';
import { coverageHandlers } from '../mcp/coverageTools';
import coverageMetros from '../../src/data/frequent-coverage-metros.json';

// CIV-2079: the coverage table as a dated, cited table; no figure for a city outside it.
const call = (args: Record<string, unknown>) => coverageHandlers.frequent_coverage(args) as Promise<Record<string, any>>;

describe('frequent_coverage', () => {
  it('gives a metro the chart’s own figures, with the run’s date and rule', async () => {
    const r = await call({ city: 'Toronto' });
    const toronto = coverageMetros.countries.find(c => c.country === 'canada')!.metros.find(m => m.name === 'Toronto')!;
    expect(r.metros[0]).toMatchObject({ metro: 'Toronto', country: 'Canada', withinWalkOfEvery15: `${(toronto.fifteenMinute * 100).toFixed(1)}%` });
    expect(r.source.figuresAsOf).toBe('2026-11-15');
    expect(r.source.rule).toBe(coverageMetros.source.rule);
  });

  it('finds a metro by one part of its name', async () => {
    expect((await call({ city: 'Kitchener' })).metros[0].metro).toMatch(/Kitchener/);
  });

  it('says plainly when a city has no figure', async () => {
    const r = await call({ city: 'Lethbridge' });
    expect(r.metros).toEqual([]);
    expect(r.note).toMatch(/no coverage figure for Lethbridge/);
  });

  it('lists a whole country', async () => {
    const r = await call({ country: 'Canada' });
    expect(r.countries).toHaveLength(1);
    expect(r.countries[0].metros.length).toBe(coverageMetros.countries.find(c => c.country === 'canada')!.metros.length);
  });
});
