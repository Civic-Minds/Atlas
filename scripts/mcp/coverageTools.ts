/**
 * frequent_coverage (CIV-2079): the share of a metro's people within a 10-minute walk of a route running every 15 or
 * every 30 min, served as a dated, cited table (Ryan's condition, 2026-11-21): the figures the frequent-service city
 * chart shows, from frequent-coverage-metros.json (Ryan-approved coverage run, its ID, date and rule in `source`),
 * never worked out here. Swap the file when CIV-2013's rerun lands; nothing else changes.
 */
import coverageMetros from '../../src/data/frequent-coverage-metros.json';
import { stopMatchText } from '../../shared/stopNameText';
import { decimalText } from '../../shared/numberText';
import type { Args } from './toolHelpers';

const COUNTRY_LABEL: Record<string, string> = { canada: 'Canada', us: 'United States' };
const percent = (share: number) => `${decimalText(share * 100, 1)}%`;
const countryOf = (q: string) => coverageMetros.countries.find(c => [c.country, COUNTRY_LABEL[c.country]].some(n => stopMatchText(n) === stopMatchText(q)) || (c.country === 'us' && /^(usa|u\.?s\.?|united states of america)$/i.test(q.trim())));

const SOURCE = {
  // The run's date, as the file's source gives it (the chart's frequentServiceCoverageUpdated is the same date).
  figuresAsOf: /\d{4}-\d{2}-\d{2}/.exec(coverageMetros.source.runs)?.[0] ?? null,
  run: coverageMetros.source.runs,
  rule: coverageMetros.source.rule,
  whichMetros: coverageMetros.source.metros,
};

export const coverageHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  frequent_coverage: async ({ city, country }) => {
    const q = String(city ?? '').trim();
    const row = (m: (typeof coverageMetros.countries)[number]['metros'][number], c: string) => ({
      metro: m.name, country: COUNTRY_LABEL[c] ?? c, population: m.population,
      withinWalkOfEvery15: percent(m.fifteenMinute), withinWalkOfEvery30: percent(m.thirtyMinute),
    });
    if (!q) {
      const list = country != null ? [countryOf(String(country))].filter(Boolean) : coverageMetros.countries;
      if (!list.length) return { country, metros: [], note: `Atlas has coverage figures for ${Object.values(COUNTRY_LABEL).join(' and ')} only.`, source: SOURCE };
      return {
        countries: list.map(c => ({ country: COUNTRY_LABEL[c!.country], withinWalkOfEvery15: percent(c!.fifteenMinute), withinWalkOfEvery30: percent(c!.thirtyMinute), metrosCounted: c!.metroCount, metros: c!.metros.map(m => row(m, c!.country)) })),
        source: SOURCE,
      };
    }
    const want = stopMatchText(q);
    const hits = coverageMetros.countries.flatMap(c => c.metros.filter(m => [m.name, m.runName].some(n => stopMatchText(n).split(/[–-]/).some(part => part.trim() === want) || stopMatchText(n) === want || stopMatchText(n).includes(want))).map(m => row(m, c.country)));
    if (!hits.length) {
      return { city: q, metros: [], note: `Atlas has no coverage figure for ${q}. It has one only for the metros in its coverage table (whichMetros below); say so rather than estimating.`, source: SOURCE };
    }
    return { city: q, metros: hits.slice(0, 5), note: 'Give the date and the rule with the figures: they come from one coverage run, not a live calculation.', source: SOURCE };
  },
};
