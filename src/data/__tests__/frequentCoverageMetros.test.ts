import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCoverageMetros } from '../../../scripts/build-frequent-coverage-metros';
import coverageMetros from '../frequent-coverage-metros.json';
import { LARGEST_COUNT, metroDisplayName, selectCoverageMetros, WIPED_OUT_MIN_POPULATION, WIPED_OUT_MIN_THIRTY } from '../frequentCoverageMetrosRule';
import { frequentCoverageCountries, frequentServiceCoverageStats } from '../frequentServiceStory';

// The corrected CIV-1179 run, in the main checkout's git-excluded editorial folder; only on Ryan's Macs.
const ARTIFACT = '/Users/ryan/Developer/Code/Platforms/Atlas/editorial/research/civ1179-coverage-summary-rerun-2026-11-14';

describe('the coverage city chart (CIV-1577)', () => {
  it('matches the coverage run it was built from', () => {
    if (!existsSync(ARTIFACT)) return;
    expect(buildCoverageMetros(ARTIFACT)).toEqual(coverageMetros);
  });

  it('shows the same national figures as the coverage table', () => {
    for (const country of frequentCoverageCountries) {
      const row = frequentServiceCoverageStats.find(r => r.country === country.label);
      expect(`${(country.fifteenMinute * 100).toFixed(2)}%`).toBe(row?.fifteenMinute);
      expect(`${(country.thirtyMinute * 100).toFixed(2)}%`).toBe(row?.thirtyMinute);
    }
  });

  it('every metro follows the stated rule', () => {
    for (const country of coverageMetros.countries) {
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
    expect(coverageMetros.countries[0].metros.map(m => m.name)).toContain('Ottawa–Gatineau');
  });

  it('picks the largest metros first, then small ones where 15 min reaches nobody', () => {
    const metro = (id: string, population: number, covered: number) => ({ id, name: id, population, coveredPopulation: covered });
    const thirty = [...Array.from({ length: 10 }, (_, i) => metro(`big${i}`, 2_000_000 - i, 100)), metro('wiped', 300_000, 90_000), metro('tiny', 200_000, 90_000), metro('has15', 300_000, 90_000)];
    const picked = selectCoverageMetros('canada', thirty, [metro('has15', 300_000, 10)]).map(m => m.id);
    expect(picked).toEqual([...Array.from({ length: 10 }, (_, i) => `big${i}`), 'wiped']);
  });
});
