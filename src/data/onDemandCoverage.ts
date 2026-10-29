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
  // Confirmed 2026-10-27 (CIV-1063): https://www.rmwb.ca/programs-and-services/transit/transit-on-demand/
  'fort-mcmurray': { serviceName: 'On-demand service', url: 'https://www.rmwb.ca/programs-and-services/transit/transit-on-demand/' },
  'sunline': { serviceName: 'SunRide' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.oakvilletransit.ca/schedules-maps/oakville-transit-on-demand/
  'oakville': { serviceName: 'Ride On-Demand', url: 'https://www.oakvilletransit.ca/schedules-maps/oakville-transit-on-demand/' },
  'saskatoon': { serviceName: 'On-Demand Transit' },
  // Confirmed 2026-10-27 (CIV-1063): https://sctbus.org/On-Demand
  'sct': { serviceName: 'Suffolk On-Demand', url: 'https://sctbus.org/On-Demand' },
  // Confirmed 2026-10-27 (CIV-1063): https://info.winnipegtransit.com/en/service/on-request
  'winnipeg': { serviceName: 'On-Request', url: 'https://info.winnipegtransit.com/en/service/on-request' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.barrie.ca/services-payments/transportation-parking/barrie-transit/transit-demand
  'barrie': { serviceName: 'Barrie On-Demand', url: 'https://www.barrie.ca/services-payments/transportation-parking/barrie-transit/transit-demand' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.fredericton.ca/node/457593
  'fredericton': { serviceName: 'On-demand service', url: 'https://www.fredericton.ca/node/457593' },
  // Confirmed 2026-10-27 (CIV-1063): https://stlaval.ca/horaire/taxi/info
  'stl': { serviceName: 'Taxi collectif', url: 'https://stlaval.ca/horaire/taxi/info' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.yrt.ca/en/schedules-and-maps/on-request-service.aspx
  'yrt': { serviceName: 'On-Request', url: 'https://www.yrt.ca/en/schedules-and-maps/on-request-service.aspx' },
  'calgary': { serviceName: 'Calgary Transit On Demand' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.dart.org/guide/transit-and-use/golink
  'dart': { serviceName: 'GoLink', url: 'https://www.dart.org/guide/transit-and-use/golink' },
  'dcta': { serviceName: 'GoZone' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.durhamregiontransit.com/routes-and-schedules/on-demand-and-specialized-services/
  'drt': { serviceName: 'DRT On Demand', url: 'https://www.durhamregiontransit.com/routes-and-schedules/on-demand-and-specialized-services/' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.gpmetro.org/metroconnect-on-demand/
  'portlandme': { serviceName: 'Metro Connect', url: 'https://www.gpmetro.org/metroconnect-on-demand/' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.greenbaywi.gov/GBM-On-Demand
  'green-bay': { serviceName: 'GBM On Demand', url: 'https://www.greenbaywi.gov/GBM-On-Demand' },
  // Confirmed 2026-10-27 (CIV-1063): https://guelph.ca/living/getting-around/bus/schedules/on-demand-bus-service/
  'guelph': { serviceName: 'On-demand service', url: 'https://guelph.ca/living/getting-around/bus/schedules/on-demand-bus-service/' },
  'gwinnett-transit': { serviceName: 'Ride Gwinnett Micro' },
  'kcata': { serviceName: 'IRIS' },
  // Unclear (CIV-1063, 2026-10-27): No dedicated page and no current zone list; the zones were redrawn after 2021 (Lakeview went fixed-route in 2025). Missing: which demand zones run tod
  'lethbridge': { serviceName: 'cityLINK' },
  'mta-flint': { serviceName: 'Genesee Connect' },
  'max-transit': { serviceName: 'On-demand service' },
  'merced': { serviceName: 'Micro Bus' },
  // Unclear (CIV-1063, 2026-10-27): Missing: a working official page confirming current service and riders.
  'milton': { serviceName: 'On-demand service' },
  // Confirmed 2026-10-27 (CIV-1063): https://northbay.ca/services-payments/north-bay-transit/dynamic-dispatching/
  'north-bay': { serviceName: 'On-demand service', url: 'https://northbay.ca/services-payments/north-bay-transit/dynamic-dispatching/' },
  'chatham-kent': { serviceName: 'Ride CK' },
  // Confirmed 2026-10-27 (CIV-1063): https://rrmetro.org/services/metro-connect
  'rockregion': { serviceName: 'METRO Connect', url: 'https://rrmetro.org/services/metro-connect' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.rtl-longueuil.qc.ca/rtl-demande
  'rtl': { serviceName: 'Transport à la demande', url: 'https://www.rtl-longueuil.qc.ca/rtl-demande' },
  'samtrans': { serviceName: 'Ride Plus' },
  'smart': { serviceName: 'SMART Flex' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.theride.org/services/flexride
  'theride': { serviceName: 'FlexRide East', url: 'https://www.theride.org/services/flexride' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.metrolinkok.org/getting-around/other-services-programs/microlink/
  'tulsa-transit': { serviceName: 'Broken Arrow On-Demand', url: 'https://www.metrolinkok.org/getting-around/other-services-programs/microlink/' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.valleyregionaltransit.org/routes/nampa-caldwell-ondemand/
  'valley-regional-transit': { serviceName: 'Route 150 On-Demand', url: 'https://www.valleyregionaltransit.org/routes/nampa-caldwell-ondemand/' },
  'fast-ca': { serviceName: 'FAST Connect' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.metro.net/riding/micro/
  'lacmta': { serviceName: 'Metro Micro', url: 'https://www.metro.net/riding/micro/' },
  // Confirmed 2026-10-27 (CIV-1063): https://itsmarta.com/reach
  'marta': { serviceName: 'MARTA Reach', url: 'https://itsmarta.com/reach' },
  'metrohouston': { serviceName: 'curb2curb' },
  // Unclear (CIV-1063, 2026-10-27): Mini MILE is a fixed route with on-demand stops (a deviated route). The page also lists Mini South Shore and Greater Syosset on-demand, but the page i
  'nice': { serviceName: 'NICE Mini' },
  // Unclear (CIV-1063, 2026-10-27): Missing: any readable current official page.
  'rtcsnv': { serviceName: 'RTC OnDemand' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.riovistacity.com/deltabreeze/page/route-51-rio-vistaisleton-city-circulator
  'riovista': { serviceName: 'Delta Breeze', url: 'https://www.riovistacity.com/deltabreeze/page/route-51-rio-vistaisleton-city-circulator' },
  // Confirmed 2026-10-27 (CIV-1063): https://www.sonomamarintrain.org/shuttleFAQs
  'smart-ca': { serviceName: 'SMART Connect', url: 'https://www.sonomamarintrain.org/shuttleFAQs' },
  'torrance-transit': { serviceName: 'Connect Torrance' },
  // Confirmed 2026-10-27 (CIV-1063): https://ridetrinitymetro.org/rider-services/ondemand/
  'trinitymetro': { serviceName: 'ZIPZONE', url: 'https://ridetrinitymetro.org/rider-services/ondemand/' },
  // Confirmed 2026-10-27 (CIV-1063): https://vinetransit.com/?p=1180
  'vine': { serviceName: 'On-demand service', url: 'https://vinetransit.com/?p=1180' },
  'yolobus': { serviceName: 'BeeLine' },
  // CIV-1063 (checked 2026-10-27), general public and running, with no zone source:
  // https://www.dartfirststate.com/Programs/dartconnect/ (zone maps are PDFs only)
  'dart-first-state': { serviceName: 'DART Connect', url: 'https://www.dartfirststate.com/Programs/dartconnect/' },
  // https://www.bctransit.com/squamish/schedules-and-maps/ondemand/ (zone map is a JPG/PDF only)
  'squamish': { serviceName: 'OnDemand', url: 'https://www.bctransit.com/squamish/schedules-and-maps/ondemand/' },
  // https://www.bctransit.com/kelowna/schedules-and-maps/ondemand/ (zone map is a JPG only)
  'kelowna': { serviceName: 'OnDemand', url: 'https://www.bctransit.com/kelowna/schedules-and-maps/ondemand/' },
};
// Removed in CIV-1063: rts (RTS Gainesville; Rochester's RTS On Demand is rgrta, not confirmed yet), dutchess (Flex
// needs a registration), cornwall (an on-request stop on a fixed route), sjsr (Taxibus picks up at fixed points on a schedule);
// then codiac (run by the City of Dieppe), mcts (FlexRide is run by MobiliSE), trimet (SPOT is run by Washington County) and
// lavta (Go Tri-Valley is an Uber/Lyft discount, not on-demand transit); sportran (its own FAQ says OnDemand is for
// riders certified for paratransit; it can come back once confirmed open to the public).

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
