import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCoverageMetros } from '../build-frequent-coverage-metros';
import coverageMetros from '../../src/data/frequent-coverage-metros.json';
import { LARGEST_COUNT, metroDisplayName, selectCoverageMetros, WIPED_OUT_MIN_POPULATION, WIPED_OUT_MIN_THIRTY } from '../../src/data/frequentCoverageMetrosRule';
import { frequentCoverageWindows } from '../../src/data/frequentServiceStory';
import { CHART_WINDOWS } from '../../pipeline/tripSets';

// CIV-2013: one run per chart window, in the main checkout's git-excluded editorial folder; only on Ryan's Macs.
const EDITORIAL = ['/Users/ryan', '/Users/atlas'].map(home => `${home}/Developer/Code/Platforms/Atlas/`).find(root => existsSync(`${root}editorial/research`));
const ARTIFACTS = CHART_WINDOWS.map(w => (EDITORIAL ?? '') + coverageMetros.windows.find(x => x.key === w.key)!.artifact);

describe('the coverage city chart (CIV-1577)', () => {
  it('matches the coverage run it was built from', () => {
    if (!EDITORIAL || !ARTIFACTS.every(a => existsSync(a))) return;
    expect(buildCoverageMetros(ARTIFACTS)).toEqual(coverageMetros);
  });

  it('shows the same national figures as the coverage table', () => {
    for (const w of frequentCoverageWindows) for (const country of w.countries) {
      const row = w.stats.find(r => r.country === country.label);
      expect(`${(country.fifteenMinute * 100).toFixed(2)}%`).toBe(row?.fifteenMinute);
      expect(`${(country.thirtyMinute * 100).toFixed(2)}%`).toBe(row?.thirtyMinute);
    }
  });

  it('every metro follows the stated rule', () => {
    for (const country of coverageMetros.windows.flatMap(w => w.countries)) {
      expect(country.metros.filter(m => m.pickedBy === 'largest')).toHaveLength(LARGEST_COUNT);
      for (const m of country.metros.filter(m => m.pickedBy === 'wiped-out')) {
        expect(m.population).toBeGreaterThan(WIPED_OUT_MIN_POPULATION);
        expect(m.thirtyMinute).toBeGreaterThanOrEqual(WIPED_OUT_MIN_THIRTY);
        expect(m.fifteenMinute).toBe(0);
      }
    }
  });

  it('names Ottawa–Gatineau as the whole metro, not the run label’s Ontario part', () => {
    expect(metroDisplayName('canada', "Ottawa - Gatineau (Ontario part / partie de l'Ontario)")).toBe('Ottawa–Gatineau');
    expect(metroDisplayName('us', 'Dallas-Fort Worth-Arlington, TX Metro Area')).toBe('Dallas');
    for (const w of coverageMetros.windows) expect(w.countries[0].metros.map(m => m.name)).toContain('Ottawa–Gatineau');
  });

  it('picks the largest metros first, then small ones where 15 min reaches nobody', () => {
    const metro = (id: string, population: number, covered: number) => ({ id, name: id, population, coveredPopulation: covered });
    const thirty = [...Array.from({ length: 10 }, (_, i) => metro(`big${i}`, 2_000_000 - i, 100)), metro('wiped', 300_000, 90_000), metro('tiny', 200_000, 90_000), metro('has15', 300_000, 90_000)];
    const picked = selectCoverageMetros('canada', thirty, [metro('has15', 300_000, 10)]).map(m => m.id);
    expect(picked).toEqual([...Array.from({ length: 10 }, (_, i) => `big${i}`), 'wiped']);
  });
});

describe('the city chart order (CIV-1577, Ryan picked grouping)', () => {
  it('puts each country’s cities at 0% at 15 min last, each part by 30-minute share', () => {
    for (const country of frequentCoverageWindows.flatMap(w => w.countries)) {
      const zeroAt = country.metros.findIndex(m => m.fifteenMinute === 0);
      const rest = zeroAt === -1 ? country.metros : country.metros.slice(0, zeroAt);
      const none = zeroAt === -1 ? [] : country.metros.slice(zeroAt);
      expect(none.every(m => m.fifteenMinute === 0)).toBe(true);
      for (const part of [rest, none]) expect(part.map(m => m.thirtyMinute)).toEqual([...part.map(m => m.thirtyMinute)].sort((a, b) => b - a));
    }
  });
});

describe('the coverage windows (CIV-2013)', () => {
  it('has one run per chart window, in CHART_WINDOWS order with its bounds, 7 AM–7 PM first', () => {
    expect(coverageMetros.windows.map(w => [w.key, w.start, w.end])).toEqual(CHART_WINDOWS.map(w => [w.key, w.start, w.end]));
    expect(frequentCoverageWindows[0].key).toBe('frequentServiceWindow');
  });
});
