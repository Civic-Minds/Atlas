/**
 * #1074: the fall-off story's data file (src/data/falloff-story.json) from the study's CSV (_reports/1074/falloff.csv,
 * written by _reports/1074/falloff.ts from a release's agency files). Rerun both to refresh the story:
 *   npx tsx scripts/research/buildFalloffStory.ts _reports/1074/falloff.csv release-mwr8hzof 2026-11-22
 * The totals count every agency, weighted by route-km. The per-agency rows keep agencies of at least MIN_KM route-km, and
 * leave out the agencies whose terms bar sharing their data (shared/rules/redistribution.ts), which stay in the totals.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { countryForRegion } from '../../shared/regionCountry';
import { mayRedistribute } from '../../shared/rules/redistribution';

export const MIN_KM = 50;
/** The story's line for "frequent in the morning" (src/data/falloffStory.ts reads it from the data file). */
export const FREQUENT_MORNING_MIN = 10;
const [csvPath, release, date] = process.argv.slice(2);
if (!csvPath || !release || !date) throw new Error('usage: buildFalloffStory.ts <falloff.csv> <release id> <YYYY-MM-DD>');

/** One CSV line into fields, with quoted fields that may hold commas. */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split('\n');
const cols = fields(header);
const rows = lines.map(l => Object.fromEntries(fields(l).map((v, i) => [cols[i], v])) as Record<string, string>);
const num = (v: string) => (v === '' ? 0 : Number(v));
const one = (n: number) => Math.round(n * 10) / 10;

/** Route-km-weighted shares of a set of agencies at each time of the week. */
function shares(set: Record<string, string>[]) {
  const km = set.reduce((s, r) => s + num(r.route_km), 0);
  const at = (col: string) => one(set.reduce((s, r) => s + num(r[col]) * num(r.route_km), 0) / km);
  return { agencies: set.length, routeKm: Math.round(km), routes: set.reduce((s, r) => s + num(r.routes), 0), weekdayMorning: at('am_pct'), weekdayMidday: at('weekday_midday_pct'), saturdayMidday: at('sat_midday_pct'), sundayEvening: at('sun_eve_pct') };
}

const countries = ['Canada', 'United States'].map(country => ({ country, ...shares(rows.filter(r => countryForRegion(r.region) === country)) }));
const agencies = rows
  .filter(r => num(r.route_km) >= MIN_KM && mayRedistribute(r.slug))
  .map(r => ({ slug: r.slug, name: r.name, region: r.region, routeKm: one(num(r.route_km)), weekdayMorning: num(r.am_pct), sundayEvening: num(r.sun_eve_pct), hasSunday: r.has_sunday === 'true' }));
const sized = rows.filter(r => num(r.route_km) >= MIN_KM);
const out = {
  release, date, minKm: MIN_KM, frequentMorningMin: FREQUENT_MORNING_MIN,
  all: shares(rows),
  countries,
  /** Agencies of at least MIN_KM route-km, and how many of them run no Sunday service (every one counted). */
  sized: {
    agencies: sized.length,
    noSunday: sized.filter(r => r.has_sunday !== 'true').length,
    /** At least FREQUENT_MORNING_MIN% frequent on a weekday morning, with nothing frequent on Sunday evening. */
    noneOnSundayEvening: sized.filter(r => num(r.am_pct) >= FREQUENT_MORNING_MIN && num(r.sun_eve_pct) === 0).length,
  },
  agencies,
};
writeFileSync('src/data/falloff-story.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`${agencies.length} agencies kept; all ${out.all.weekdayMorning}% to ${out.all.sundayEvening}%`);
