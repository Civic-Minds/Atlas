/**
 * Builds shared/data/large-metros.json, the list of "large metros" that lets a one-agency area
 * earn a page, from official population data:
 *
 *   US:     Census Bureau Vintage 2024 CBSA population estimates (cbsa-est2024-alldata.csv),
 *           the 50 largest metropolitan statistical areas by POPESTIMATE2024.
 *   Canada: Statistics Canada 2021 Census, table 98-10-0003 (census metropolitan areas),
 *           the 10 largest CMAs by 2021 population.
 *
 * Re-runnable:
 *   npx tsx scripts/build-large-metros.ts            ranks the committed source files
 *   npx tsx scripts/build-large-metros.ts --fetch    downloads fresh source files first (read-only)
 *
 * The source files are committed in shared/data/metro-population/ with their URLs and fetch date
 * in the README next to them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rankLargeMetros, parseCsv } from '../shared/largeMetros';

const DIR = 'shared/data/metro-population';
const US_URL = 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/metro/totals/cbsa-est2024-alldata.csv';
const CA_URL = 'https://www150.statcan.gc.ca/n1/tbl/csv/98100003-eng.zip';
const US_FILE = `${DIR}/us-cbsa-population-2024.csv`;
const CA_FILE = `${DIR}/ca-cma-population-2021.csv`;

async function fetchSources() {
  mkdirSync(DIR, { recursive: true });
  const us = parseCsv(Buffer.from(await (await fetch(US_URL)).arrayBuffer()).toString('latin1'));
  const keep = us.filter(r => r.LSAD === 'Metropolitan Statistical Area' || r.LSAD === 'Micropolitan Statistical Area');
  writeFileSync(US_FILE, ['CBSA,NAME,LSAD,POPESTIMATE2024', ...keep.map(r => [r.CBSA, `"${r.NAME}"`, r.LSAD, r.POPESTIMATE2024].join(','))].join('\n') + '\n');

  const tmp = mkdtempSync(join(tmpdir(), 'statcan-'));
  writeFileSync(join(tmp, 'cma.zip'), Buffer.from(await (await fetch(CA_URL)).arrayBuffer()));
  execFileSync('unzip', ['-oq', join(tmp, 'cma.zip'), '-d', tmp]);
  const ca = parseCsv(readFileSync(join(tmp, '98100003.csv'), 'utf8').replace(/^﻿/, ''));
  const cmaRows = ca.filter(r => (r.DGUID ?? '').includes('S0503') && /^\d+$/.test(r['Population and dwelling counts (13): Population, 2021 [1]'] ?? ''));
  writeFileSync(CA_FILE, ['GEO,DGUID,POPULATION2021', ...cmaRows.map(r => [`"${r.GEO}"`, r.DGUID, r['Population and dwelling counts (13): Population, 2021 [1]']].join(','))].join('\n') + '\n');

  writeFileSync(`${DIR}/README.md`, `# Metro area population sources

Official population figures used to decide which metro areas count as "large" (see
scripts/build-large-metros.ts and shared/data/large-metros.json). Fetched read-only on ${new Date().toISOString().slice(0, 10)}.

- \`us-cbsa-population-2024.csv\`: US Census Bureau, Vintage 2024 population estimates for
  metropolitan and micropolitan statistical areas, trimmed to CBSA, NAME, LSAD, POPESTIMATE2024.
  Source: ${US_URL}
- \`ca-cma-population-2021.csv\`: Statistics Canada, 2021 Census, table 98-10-0003-01, census
  metropolitan areas, trimmed to GEO, DGUID, POPULATION2021.
  Source: ${CA_URL} (https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810000301)

Rule: the 50 largest US metropolitan statistical areas and the 10 largest Canadian CMAs.
Regenerate: \`npx tsx scripts/build-large-metros.ts --fetch\`.
`);
}

if (process.argv.includes('--fetch') || !existsSync(US_FILE)) await fetchSources();
const list = rankLargeMetros(readFileSync(US_FILE, 'utf8'), readFileSync(CA_FILE, 'utf8'));
writeFileSync('shared/data/large-metros.json', JSON.stringify(list, null, 2) + '\n');
console.log(`large-metros.json: ${list.filter(m => m.country === 'United States').length} US, ${list.filter(m => m.country === 'Canada').length} Canada`);
