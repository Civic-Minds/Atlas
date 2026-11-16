/**
 * CIV-1724: how many transit agencies and which countries Atlas covers, for prose ("Atlas covers 532 transit
 * agencies in Canada and the US"). One small file written with the agency page summaries (atlasCoverage in
 * agencyIndex.ts, the index list's own count), so the words follow the published data and are never typed by hand.
 */
import coverage from './data/atlas-coverage.json';
import { BETA_BUILD } from './config';
import { countText } from './numberText';
import { joinList } from './overflowText';
import type { AtlasCoverage } from './agencyIndex';

/** Country names as prose says them after "in". */
const COUNTRY_PROSE: Record<string, string> = { 'United States': 'the US' };

/** This build's coverage: beta builds count beta-only agencies, as their pages do. */
export const ATLAS_COVERAGE: AtlasCoverage = BETA_BUILD ? coverage.beta : coverage.public;

/** "532": the exact agency count (Ryan, CIV-1724: "it is exactly that many"), no "about" and no rounding. */
export const coverageAgenciesText = (c: AtlasCoverage = ATLAS_COVERAGE): string => countText(c.agencies);

/** "Canada and the US". */
export const coverageCountriesText = (c: AtlasCoverage = ATLAS_COVERAGE): string => joinList(c.countries.map(n => COUNTRY_PROSE[n] ?? n));
