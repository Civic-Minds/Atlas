/**
 * Region → country lookup, for deriving which countries Atlas currently covers
 * from the agency registry's existing `region` field, without a per-agency
 * `country` field (a bigger migration across all agency configs — tracked as a
 * follow-up in docs/roadmap/TECHNICAL.md § Data Quality).
 *
 * Every region value currently in use (Canadian provinces/territories, US
 * states + DC) maps here. Add one entry per new country's first agency —
 * proportional to the config work already done when adding that agency.
 */
const REGION_TO_COUNTRY: Record<string, string> = {
  // Canada
  'Alberta': 'Canada',
  'British Columbia': 'Canada',
  'Manitoba': 'Canada',
  'New Brunswick': 'Canada',
  'Newfoundland': 'Canada',
  'Northwest Territories': 'Canada',
  'Nova Scotia': 'Canada',
  'Ontario': 'Canada',
  'Prince Edward Island': 'Canada',
  'Quebec': 'Canada',
  'Saskatchewan': 'Canada',
  'Yukon': 'Canada',
  // United States (50 states + DC)
  'Alabama': 'United States',
  'Alaska': 'United States',
  'Arizona': 'United States',
  'Arkansas': 'United States',
  'California': 'United States',
  'Colorado': 'United States',
  'Connecticut': 'United States',
  'Delaware': 'United States',
  'Florida': 'United States',
  'Georgia': 'United States',
  'Hawaii': 'United States',
  'Idaho': 'United States',
  'Illinois': 'United States',
  'Indiana': 'United States',
  'Iowa': 'United States',
  'Kansas': 'United States',
  'Kentucky': 'United States',
  'Louisiana': 'United States',
  'Maine': 'United States',
  'Maryland': 'United States',
  'Massachusetts': 'United States',
  'Michigan': 'United States',
  'Minnesota': 'United States',
  'Mississippi': 'United States',
  'Missouri': 'United States',
  'Montana': 'United States',
  'Nebraska': 'United States',
  'Nevada': 'United States',
  'New Hampshire': 'United States',
  'New Jersey': 'United States',
  'New Mexico': 'United States',
  'New York': 'United States',
  'North Carolina': 'United States',
  'North Dakota': 'United States',
  'Ohio': 'United States',
  'Oklahoma': 'United States',
  'Oregon': 'United States',
  'Pennsylvania': 'United States',
  'Rhode Island': 'United States',
  'South Carolina': 'United States',
  'South Dakota': 'United States',
  'Tennessee': 'United States',
  'Texas': 'United States',
  'Utah': 'United States',
  'Vermont': 'United States',
  'Virginia': 'United States',
  'Washington': 'United States',
  'Washington DC': 'United States',
  'West Virginia': 'United States',
  'Wisconsin': 'United States',
  'Wyoming': 'United States',
  // Mexico
  'Jalisco': 'Mexico',
  // France
  'Grand Est': 'France',
  'Bretagne': 'France',
};

export function countryForRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  return REGION_TO_COUNTRY[region] ?? null;
}

/** Canonical display order — North America first (the established base), then newer countries by addition order. */
const COUNTRY_DISPLAY_ORDER = ['Canada', 'United States', 'Mexico', 'France'];

/**
 * Distinct countries represented across a set of agencies, in a stable display
 * order. Pass the caller's already-visibility-filtered agency list (e.g. the
 * frontend's `hiddenInProduction`-filtered array) so a country with only
 * hidden-in-production agencies doesn't get listed before it's actually live.
 */
export function countriesForAgencies(agencies: Array<{ region?: string | null }>): string[] {
  const present = new Set<string>();
  for (const a of agencies) {
    const country = countryForRegion(a.region);
    if (country) present.add(country);
  }
  return COUNTRY_DISPLAY_ORDER.filter(c => present.has(c));
}
