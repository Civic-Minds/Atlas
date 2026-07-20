/**
 * countryLaunchGate.ts — refuse live R2 writes for a country that has zero
 * production-visible agencies yet (France, Mexico, Belgium, …), unless the
 * caller passes an explicit override flag.
 *
 * Policy source: AGENTS.md § Production Data Rules / docs/ADDING_AGENCIES.md.
 * `hiddenInProduction` only hides UI; R2 uploads still go to the live public
 * bucket. Publishing a new country's first agency is a country-launch decision,
 * not a routine agency add — and "we already wrote Metz" is not authorization.
 *
 * Pure logic only (no fs/network) so unit tests stay cheap. Scripts supply the
 * agency registry and the resolved country for the agency being written.
 */

import { countryForRegion } from '../shared/regionCountry.js';

/** CLI flag that opts into a real R2 write for an unlaunched country. */
export const COUNTRY_LAUNCH_FLAG = '--i-am-launching-country';

export interface AgencyCountrySource {
  slug: string;
  region?: string | null;
  center?: [number, number] | null;
  hiddenInProduction?: boolean;
  staged?: boolean;
}

/** Production-visible = not hidden and not staged (matches agencyIndex filter). */
export function isAgencyLiveInProduction(
  agency: Pick<AgencyCountrySource, 'hiddenInProduction' | 'staged'>,
): boolean {
  return !agency.hiddenInProduction && !agency.staged;
}

/**
 * True when at least one production-visible agency maps to `country` via region.
 * A country with only `hiddenInProduction` agencies (France, Mexico today) has
 * zero live agencies and is still gated.
 */
export function countryHasLiveAgencies(
  country: string,
  agencies: AgencyCountrySource[],
): boolean {
  return agencies.some(
    a => isAgencyLiveInProduction(a) && countryForRegion(a.region) === country,
  );
}

/**
 * Rough [south, west, north, east] boxes used only as a fallback when an
 * agency has no mapped `region` yet (e.g. brand-new `npm run process` before
 * config is written). US/Canada intentionally omitted — unmapped US regions
 * must keep working. International candidates that land here are the ones we
 * most want the gate to catch.
 */
// Order matters: more specific / smaller countries first so border cities
// (Brussels, Bilbao) don't match a generous France envelope first.
const FALLBACK_COUNTRY_BBOXES: Array<{ country: string; bbox: [number, number, number, number] }> = [
  { country: 'Belgium', bbox: [49.45, 2.5, 51.55, 6.45] },
  { country: 'Spain', bbox: [35.9, -9.6, 43.9, 4.5] },
  // Mainland + Corsica; Belgium/Spain listed first handle border overlaps.
  { country: 'France', bbox: [41.2, -5.6, 51.15, 9.8] },
  { country: 'Mexico', bbox: [14.5, -118.5, 32.8, -86.5] },
];

/** Resolve country from center when region is missing/unmapped. */
export function countryFromCenter(center: [number, number] | null | undefined): string | null {
  if (!center || center.length < 2) return null;
  const [lat, lon] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const { country, bbox } of FALLBACK_COUNTRY_BBOXES) {
    const [s, w, n, e] = bbox;
    if (lat >= s && lat <= n && lon >= w && lon <= e) return country;
  }
  return null;
}

/**
 * Best-effort country for an agency about to be written to R2.
 * Prefer explicit region mapping; fall back to center for unconfigured candidates.
 */
export function resolveAgencyCountry(agency: {
  region?: string | null;
  center?: [number, number] | null;
}): string | null {
  return countryForRegion(agency.region) ?? countryFromCenter(agency.center ?? null);
}

export class CountryLaunchBlockedError extends Error {
  readonly country: string;
  readonly slug: string;

  constructor(country: string, slug: string, action: string) {
    super(
      `${action} for "${slug}" blocked: ${country} has zero production-visible agencies yet. ` +
        `Stay on --dry-run + local preview until the country is deliberately launched. ` +
        `hiddenInProduction is NOT a substitute for staying offline (data still hits the live R2 bucket). ` +
        `To override after explicit maintainer approval, re-run with ${COUNTRY_LAUNCH_FLAG}. ` +
        `See AGENTS.md § Production Data Rules.`,
    );
    this.name = 'CountryLaunchBlockedError';
    this.country = country;
    this.slug = slug;
  }
}

/**
 * Production public bucket is `atlas`. Writes to any other bucket (e.g.
 * `atlas-staging`) are dress-rehearsal — country-launch gate does not apply.
 */
export function isProductionPublicR2Bucket(): boolean {
  const bucket = (process.env.R2_BUCKET_NAME ?? 'atlas').replace(/^["']|["']$/g, '');
  return bucket === 'atlas';
}

/**
 * Refuse a production R2 write when the target country has no production-visible
 * agencies yet, unless `forceLaunch` is true (CLI flag was passed).
 *
 * No-ops when:
 * - writing to a non-production bucket (staging dress rehearsal)
 * - `country` is null (unmapped region — typically US/Canada typo we don't brick)
 * - the country already has at least one production-visible agency
 */
export function assertCountryMayWriteToR2(opts: {
  country: string | null;
  agencies: AgencyCountrySource[];
  forceLaunch: boolean;
  slug: string;
  action: string;
}): void {
  if (opts.forceLaunch) return;
  if (!isProductionPublicR2Bucket()) return;
  if (!opts.country) return;
  if (countryHasLiveAgencies(opts.country, opts.agencies)) return;
  throw new CountryLaunchBlockedError(opts.country, opts.slug, opts.action);
}

/** True when a production R2 write for this country would be blocked without the flag. */
export function isCountryLaunchBlocked(
  country: string | null,
  agencies: AgencyCountrySource[],
): boolean {
  if (!isProductionPublicR2Bucket()) return false;
  if (!country) return false;
  return !countryHasLiveAgencies(country, agencies);
}
