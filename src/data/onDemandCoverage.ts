/**
 * On-demand coverage the map can't draw yet (CIV-23). A missing zone must never read as "no
 * on-demand service here", so each agency is in one of three states:
 *   1. Mapped: its zone is drawn (agency.onDemandServiceArea).
 *   2. Has on-demand, not mapped yet: a note on the agency card, no zone (ON_DEMAND_NOT_MAPPED).
 *   3. No on-demand: nothing shown.
 * A mapped agency can also list the part of its service that isn't drawn yet (ON_DEMAND_PARTLY_MAPPED).
 *
 * Sourced from the on-demand outreach tracker (Notion "Atlas Data Issues", 2026-10-11). Keys are
 * Atlas agency slugs; only agencies Atlas already shows get a card note.
 */

export interface OnDemandNotMapped {
  /** Rider-facing name of the service, e.g. "Pickup" or "On-Request". */
  serviceName: string;
  /** The agency's own page for the service, when known. */
  url?: string;
}

export const ON_DEMAND_NOT_MAPPED: Readonly<Record<string, OnDemandNotMapped>> = {
  'fort-mcmurray': { serviceName: 'On-demand service' },
  'sunline': { serviceName: 'SunRide' },
  'niagara': { serviceName: 'NRT OnDemand' },
  'oakville': { serviceName: 'Ride On-Demand' },
  'sjsr': { serviceName: 'Taxibus' },
  'saskatoon': { serviceName: 'On-Demand Transit' },
  'sct': { serviceName: 'Suffolk On-Demand' },
  'winnipeg': { serviceName: 'On-Request' },
  'barrie': { serviceName: 'Barrie On-Demand' },
  'fredericton': { serviceName: 'On-demand service' },
  'stl': { serviceName: 'Taxi collectif' },
  'yrt': { serviceName: 'On-Request' },
  'calgary': { serviceName: 'Calgary Transit On Demand' },
  'codiac': { serviceName: 'On-demand service' },
  'cornwall': { serviceName: 'Riverdale On-Demand' },
  'dart': { serviceName: 'GoLink' },
  'dcta': { serviceName: 'GoZone' },
  'drt': { serviceName: 'DRT On Demand' },
  'portlandme': { serviceName: 'Metro Connect' },
  'green-bay': { serviceName: 'GBM On Demand' },
  'guelph': { serviceName: 'On-demand service' },
  'gwinnett-transit': { serviceName: 'Ride Gwinnett Micro' },
  'kcata': { serviceName: 'IRIS' },
  'lethbridge': { serviceName: 'cityLINK' },
  'mta-flint': { serviceName: 'Genesee Connect' },
  'max-transit': { serviceName: 'On-demand service' },
  'medicine-hat': { serviceName: 'MHTnow' },
  'merced': { serviceName: 'Micro Bus' },
  'milton': { serviceName: 'On-demand service' },
  'mcts': { serviceName: 'FlexRide' },
  'north-bay': { serviceName: 'On-demand service' },
  'chatham-kent': { serviceName: 'Ride CK' },
  'rockregion': { serviceName: 'METRO Connect' },
  'rtl': { serviceName: 'Transport à la demande' },
  'samtrans': { serviceName: 'Ride Plus' },
  'smart': { serviceName: 'SMART Flex' },
  'theride': { serviceName: 'FlexRide East' },
  'trimet': { serviceName: 'SPOT Southwest' },
  'tulsa-transit': { serviceName: 'Broken Arrow On-Demand' },
  'valley-regional-transit': { serviceName: 'Route 150 On-Demand' },
  'cdta': { serviceName: 'CDTA FLEX' },
  'dutchess': { serviceName: 'Dutchess Flex' },
  'fast-ca': { serviceName: 'FAST Connect' },
  'godurham': { serviceName: 'GoDurham Connect' },
  'lavta': { serviceName: 'Go Tri-Valley' },
  'lacmta': { serviceName: 'Metro Micro' },
  'lynx': { serviceName: 'NeighborLink' },
  'marta': { serviceName: 'MARTA Reach' },
  'metrohouston': { serviceName: 'curb2curb' },
  'nice': { serviceName: 'NICE Mini' },
  'omniride': { serviceName: 'On-demand service' },
  'pace-bus': { serviceName: 'Pace On Demand' },
  'rtcsnv': { serviceName: 'RTC OnDemand' },
  'riovista': { serviceName: 'Delta Breeze' },
  'rts': { serviceName: 'RTS On Demand' },
  'saint-john': { serviceName: 'FLEX' },
  'santaclarita': { serviceName: 'Go! Santa Clarita' },
  'smart-ca': { serviceName: 'SMART Connect' },
  'sportran': { serviceName: 'SporTran OnDemand' },
  'torrance-transit': { serviceName: 'Connect Torrance' },
  'trinitymetro': { serviceName: 'ZIPZONE' },
  'via': { serviceName: 'VIA Link' },
  'vine': { serviceName: 'On-demand service' },
  'nashvillemta': { serviceName: 'WeGo Link' },
  'wrta': { serviceName: 'Via-WRTA' },
  'yolobus': { serviceName: 'BeeLine' },
};

/** Mapped agencies whose drawn zones leave out part of the service, and what's missing. */
// Empty: every mapped agency's source covers all the zones it runs today (Ryan, 2026-10-11).
export const ON_DEMAND_PARTLY_MAPPED: Readonly<Record<string, string>> = {};

export type OnDemandCoverageNote =
  | { kind: 'not-mapped'; serviceName: string; url?: string }
  | { kind: 'partly-mapped'; missing: string };

/** The coverage note for an agency card, or null when there's nothing to say (state 1 or 3). */
export function onDemandCoverageNote(
  agency: { slug: string; onDemandServiceArea?: unknown },
  partlyMapped: Readonly<Record<string, string>> = ON_DEMAND_PARTLY_MAPPED,
): OnDemandCoverageNote | null {
  if (agency.onDemandServiceArea) {
    const missing = partlyMapped[agency.slug];
    return missing ? { kind: 'partly-mapped', missing } : null;
  }
  const entry = ON_DEMAND_NOT_MAPPED[agency.slug];
  return entry ? { kind: 'not-mapped', ...entry } : null;
}
