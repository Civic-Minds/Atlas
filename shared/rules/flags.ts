/**
 * Every feature switch Atlas has, in one place (rules audit 4.1, move 10): the build-time VITE_* switches (envFlag),
 * the Atlas mode, each feature's *_ENABLED value, the FEATURES registry, FEATURE_ROUTES and the History v2 switch.
 * The VITE_* reads stay literal import.meta.env reads so Vite can drop off features from each build. Flag docs:
 * docs/FEATURE_FLAGS.md.
 */
import { INTERNAL_PATH, MCP_DOCS_PATH, RESEARCH_PATH, STUDIO_CHANGES_PATH, STUDIO_COVERAGE_PATH, STUDIO_PATH, STUDIO_VEHICLES_PATH } from './paths';

// Live and History cover a tiny sliver of agencies with no scaling plan yet (Ryan, 2026-07-29) --
// off by default until that's resolved. Env-driven rather than a hardcoded constant so production
// and beta can build the same main commit with different feature exposure.
function envFlag(name: 'VITE_LIVE_ENABLED' | 'VITE_LIVE_REPORTS_ENABLED' | 'VITE_HISTORY_ENABLED' | 'VITE_BETA_BUILD' | 'VITE_PREVIEW_BUILD' | 'VITE_CARD_CLICK_TO_FLAG_ENABLED' | 'VITE_UNEVEN_BANNER_ENABLED' | 'VITE_HISTORY_DAY_PICKER_ENABLED' | 'VITE_BRANCH_READINGS_ENABLED'): boolean {
  return typeof import.meta !== 'undefined' && import.meta?.env?.[name] === 'true';
}

export const LIVE_ENABLED = envFlag('VITE_LIVE_ENABLED');
// Live reports only: the static route and agency pages (/apps/live/:agency, /apps/live/:agency/:route), reading the
// published analysis JSON from R2. Nothing realtime: the map vehicle layer, stop-card arrivals and the route-card
// delay stay behind VITE_LIVE_ENABLED and the local-only endpoints (#867).
export const LIVE_REPORTS_ENABLED = envFlag('VITE_LIVE_REPORTS_ENABLED');
export const HISTORY_ENABLED = envFlag('VITE_HISTORY_ENABLED');
// Click-to-flag a specific value on a card (frequency, route name, etc.) to report it directly,
// no typing required. New/unproven interaction -- beta only until it's been used for real.
export const CARD_CLICK_TO_FLAG_ENABLED = envFlag('VITE_CARD_CLICK_TO_FLAG_ENABLED');
// "Service is uneven" route-card banner. The threshold that decides when a period's worst gap
// is worth surfacing to a rider needed more real-feed tuning than a single main push should
// carry -- beta only until it's been validated against a lot more agencies (2026-08-08).
export const UNEVEN_BANNER_ENABLED = envFlag('VITE_UNEVEN_BANNER_ENABLED');
// CIV-1959 B3 (#1620): the cards show each branch's own reading beside the trunk's, and the existing no-number words ("Runs irregularly in this
// period") for a branch with too few trips to read. Off everywhere until the dry run is reviewed (docs/FEATURE_FLAGS.md); reads only data the pipeline switch
// ATLAS_BRANCH_READINGS=1 wrote, so it does nothing on any published file today.
export const BRANCH_READINGS_ENABLED = envFlag('VITE_BRANCH_READINGS_ENABLED');
export type AtlasMode = 'public' | 'preview' | 'beta' | 'dev';

function getAtlasMode(): AtlasMode {
  // Plain import.meta.env (not import.meta?.env) so Vite and Vitest both resolve it; the
  // guard covers tsx scripts, where import.meta.env is undefined.
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  const configured = env?.VITE_ATLAS_MODE;
  if (configured === 'public' || configured === 'preview' || configured === 'beta' || configured === 'dev') return configured;
  // Preserve the existing defaults when the explicit mode is not configured yet.
  if (env?.DEV) return 'dev';
  if (envFlag('VITE_PREVIEW_BUILD')) return 'preview';
  return envFlag('VITE_BETA_BUILD') ? 'beta' : 'public';
}

export const ATLAS_MODE = getAtlasMode();
export const BETA_BUILD = ATLAS_MODE !== 'public';
export const PREVIEW_BUILD = ATLAS_MODE === 'preview';
export const RESEARCH_APPS_ENABLED = ATLAS_MODE === 'beta' || ATLAS_MODE === 'dev';
// CIV-1425 / CIV-1646: History's Weekday/Saturday/Sunday picker. On in beta and dev (Boston's weekend values are
// built); public stays off until Ryan turns it on, which the env var still does anywhere. Needs History on too.
export const HISTORY_DAY_PICKER_ENABLED = HISTORY_ENABLED && (ATLAS_MODE === 'beta' || ATLAS_MODE === 'dev' || envFlag('VITE_HISTORY_DAY_PICKER_ENABLED'));
// Shared links and shared map images carry utm tags so analytics can count shared visits.
// Beta-only until it's been seen working end to end.
export const SHARE_UTM_ENABLED = ATLAS_MODE === 'beta' || ATLAS_MODE === 'dev';
// While a mode (Live, History, Compare) is active, the other mode tabs shrink to icons. Beta-only.
export const COLLAPSE_MODE_TABS_ENABLED = ATLAS_MODE === 'beta' || ATLAS_MODE === 'dev';
// CIV-1567: one gentle transition for entering and leaving a mode (Compare, History): the new view fades in once its
// map has drawn, and a map's label changes only when the map has redrawn. On in every mode since Ryan's OK on beta
// (2026-11-17, "Looks pretty good yes ty"); Live stays without it.
export const MODE_TRANSITIONS_ENABLED = true;
// #690: route lines drawn in segments coloured by the pooled per-stop tier (every trip at each
// stop), with the route-level tier still deciding the filter. Beta and dev only until the
// segment colours have been looked at on real routes.
export const SEGMENT_COLOURS_ENABLED = ATLAS_MODE === 'beta' || ATLAS_MODE === 'dev';
// CIV-1822 (CIV-1579 option 1): the frequency filter reads each route's frequent shared middle (its trunk, tv_) instead
// of the value its slowest branch sets (rv_). On only where section colours are on, so a slower branch is drawn in its
// own colour rather than the trunk's; it goes public when section colours do (Ryan, CIV-1830).
export const TRUNK_FILTER_ENABLED = SEGMENT_COLOURS_ENABLED;
// Population density / median household income shading under the route lines (CIV-482). There is no production data URL yet, so even where the flag is on the control stays hidden
// unless a dev-only file URL is set (CONTEXT_LAYER_URL below).
// CIV-524 (Ryan, 2026-11-14: "I think it should be local only"): local dev only, like the connections bar; off on
// public, preview and beta.
export const CONTEXT_LAYER_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;
// Local testing only: a PMTiles URL for the context layer (served by vite from tmp/dev-context, see
// vite.config.ts). Ignored in every built site, so a deployed build can never be pointed at other data.
const devContextUrl: unknown =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV ? import.meta.env.VITE_CONTEXT_LAYER_URL : undefined;
export const CONTEXT_LAYER_URL: string | undefined =
  typeof devContextUrl === 'string' && devContextUrl ? devContextUrl : undefined;
// On-demand zones, the On-demand filter chip and the standalone on-demand agencies. Beta and
// preview only until Ryan signs off on the public launch (CIV-23); launch flips this one value.
export const ON_DEMAND_PUBLIC = false;
export const ON_DEMAND_ENABLED = ON_DEMAND_PUBLIC || BETA_BUILD;
// Local testing only: read on-demand files from a dev path instead of R2 (CIV-50). Ignored in
// every built site, so a deployed build can't be pointed at other files.
const devOnDemandUrl: unknown =
  typeof import.meta !== 'undefined' && import.meta?.env?.DEV ? import.meta?.env?.VITE_ON_DEMAND_URL : undefined;
export const ON_DEMAND_URL_OVERRIDE: string | undefined =
  typeof devOnDemandUrl === 'string' && devOnDemandUrl ? devOnDemandUrl : undefined;
export function getAgencyCatalogUrl(mode: AtlasMode = ATLAS_MODE): string {
  return `/data/catalog-${mode}.json`;
}

// Beta-only features that used to read FEATURES.beta ("any non-public build") because they had no flag
// of their own. Each has its own name now so it can graduate alone; until one is changed on purpose,
// every one of them is exactly BETA_BUILD, so what each build shows has not changed.
// Saved Settings: hide-low-quality, persistent legend and data saver, remembered between visits.
export const PERSISTED_SETTINGS_ENABLED = BETA_BUILD;
// The "a new version is available" banner.
export const UPDATE_BANNER_ENABLED = BETA_BUILD;
// CIV-98: on a slow connection the map loads fewer networks and offers to turn on Data saver for good, in the analytics
// prompt's place (Ryan, 2026-11-20: "The same lace the analytics one goes right"). Beta, preview and dev; off on public.
export const SLOW_CONNECTION_PROMPT_ENABLED = BETA_BUILD;
// The map-context readout and the match percentage in the map's status badge.
export const MAP_CONTEXT_ENABLED = BETA_BUILD;
export const MATCH_PERCENTAGE_ENABLED = BETA_BUILD;
// Feed-quality notes on the route and agency cards.
export const FEED_QUALITY_ENABLED = BETA_BUILD;
// The "Outdated" choice in the agency list filter.
export const OUTDATED_FILTER_ENABLED = BETA_BUILD;
// Entries marked beta-only in "What's new".
export const WHATS_NEW_BETA_ITEMS_ENABLED = BETA_BUILD;
// "Includes variants ..." under a route's title.
export const ROUTE_VARIANTS_ENABLED = BETA_BUILD;
// Trip running times on the route card's frequency chart.
export const RUNNING_TIMES_ENABLED = BETA_BUILD;
// The expand control on the route card's frequency chart.
export const SPARKLINE_EXPAND_ENABLED = BETA_BUILD;
// The "For Transit Planners" page (CIV-1320): its route, footer link, prerendered page and link preview. Local only
// (Ryan, 2026-11-15, CIV-1704: "then make the for planners page local only"): on the Vite dev server, as the connections
// bar is, never on beta or public builds.
export const PLANNERS_LINK_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;
// The "For Researchers" page (CIV-1709): its route, footer link, prerendered page and link preview. Local only, like the
// planners page, until History goes public: on the Vite dev server, never on beta or public builds.
export const RESEARCHERS_LINK_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;
// "Source" link to the agency's own website on the agency card (CIV-467; renamed in CIV-841).
// Off everywhere (CIV-940): it links to the agency's website, not its data feed.
export const DATA_SOURCE_LINK_ENABLED = false;
// The connections top bar (CIV-1353): pick a route's trip, a wait and a walk, and the map shows the connecting
// routes. Local only for now (Ryan, 2026-11-06: "can it be local only for now"): on the Vite dev server, as Live is,
// never on beta or public builds.
// Plain import.meta.env, as getAtlasMode reads it, so Vite and Vitest both resolve it; the guard covers tsx scripts.
export const CONNECTIONS_BAR_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;

// The hours-of-service bar on agency pages (CIV-1605, CIV-1611): a bar per route for the weekday hours it runs, carrying
// its exact first and last times so the table's cells drop "from"/"until". Local only for now (Ryan, 2026-11-15: "1 but
// local for now"): on the Vite dev server, as the connections bar is, never on beta or public builds.
export const AGENCY_HOURS_BAR_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;

// Atlas Studio, the agency tools section (CIV-1693; DECISIONS.md 2026-11-15, Ryan: "Yes local only"): its pages and the
// header's Studio link. Local only until the demo is ready: on the Vite dev server, never on beta or public builds.
export const STUDIO_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env && !!import.meta.env.DEV;

/**
 * Single source of truth for feature exposure. Consumers should use this registry for navigation,
 * routes, data, and controls instead of checking environment flags independently.
 */
export const FEATURES = {
  beta: BETA_BUILD,
  preview: PREVIEW_BUILD,
  researchApps: RESEARCH_APPS_ENABLED,
  live: LIVE_ENABLED,
  // CIV-1872: one rule for the report pages and their routes. The dev server always has them (it used to register the
  // routes but show "Live is off" unless an env switch was also set).
  liveReports: LIVE_ENABLED || LIVE_REPORTS_ENABLED || STUDIO_ENABLED,
  history: HISTORY_ENABLED,
  historyDayPicker: HISTORY_DAY_PICKER_ENABLED,
  frequentService: RESEARCH_APPS_ENABLED,
  shareUtm: SHARE_UTM_ENABLED,
  collapseModeTabs: COLLAPSE_MODE_TABS_ENABLED,
  modeTransitions: MODE_TRANSITIONS_ENABLED,
  onDemand: ON_DEMAND_ENABLED,
  cardClickToFlag: CARD_CLICK_TO_FLAG_ENABLED,
  unevenBanner: UNEVEN_BANNER_ENABLED,
  segmentColours: SEGMENT_COLOURS_ENABLED,
  trunkFilter: TRUNK_FILTER_ENABLED,
  contextLayer: CONTEXT_LAYER_ENABLED,
  persistedSettings: PERSISTED_SETTINGS_ENABLED,
  updateBanner: UPDATE_BANNER_ENABLED,
  slowConnectionPrompt: SLOW_CONNECTION_PROMPT_ENABLED,
  mapContext: MAP_CONTEXT_ENABLED,
  matchPercentage: MATCH_PERCENTAGE_ENABLED,
  feedQuality: FEED_QUALITY_ENABLED,
  outdatedFilter: OUTDATED_FILTER_ENABLED,
  whatsNewBetaItems: WHATS_NEW_BETA_ITEMS_ENABLED,
  routeVariants: ROUTE_VARIANTS_ENABLED,
  runningTimes: RUNNING_TIMES_ENABLED,
  sparklineExpand: SPARKLINE_EXPAND_ENABLED,
  plannersLink: PLANNERS_LINK_ENABLED,
  researchersLink: RESEARCHERS_LINK_ENABLED,
  dataSourceLink: DATA_SOURCE_LINK_ENABLED,
  connectionsBar: CONNECTIONS_BAR_ENABLED,
  agencyHoursBar: AGENCY_HOURS_BAR_ENABLED,
  studio: STUDIO_ENABLED,
  branchReadings: BRANCH_READINGS_ENABLED,
  /** CIV-1872: the /internal home page and the header's internal links: the dev server only. */
  internal: STUDIO_ENABLED,
} as const;

/** The flags the SEO title and description depend on, read the same way by the client hook and the prerender. */
export function seoFlags() {
  return {
    researchApps: FEATURES.researchApps,
    live: FEATURES.live,
    history: FEATURES.history,
    planners: FEATURES.plannersLink,
    researchers: FEATURES.researchersLink,
  };
}

export const FEATURE_ROUTES = {
  research: RESEARCH_PATH,
  /** CIV-1693: Atlas Studio, local only (FEATURES.studio). */
  studio: STUDIO_PATH,
  studioVehicles: STUDIO_VEHICLES_PATH,
  studioChanges: STUDIO_CHANGES_PATH,
  studioCoverage: STUDIO_COVERAGE_PATH,
  internal: INTERNAL_PATH,
  /** CIV-1900: the MCP's internal docs page, local only like /internal. */
  mcpDocs: MCP_DOCS_PATH,
  nightService: '/research/night',
  freeChildFares: '/research/free-child-fares',
  /** CIV-101: beta-only, not listed on /research yet. */
  bustangConnections: '/research/bustang-connections',
  frequentService: {
    map: '/research/frequent-service',
    story: '/research/frequent-service/story',
  },
} as const;

/** The one switch for every History v2 behaviour in the pipeline: ATLAS_HISTORY_V2=1, exactly (pipeline/historyV2Flag.ts reads the env). */
export function historyV2Enabled(envValue: string | undefined): boolean {
  return envValue === '1';
}

/**
 * CIV-1959 B1 (#1620, #1086): the pipeline switch for "a direction's headline comes from its trunk, never a branch or tail":
 * ATLAS_HEADLINE_FROM_TRUNK=1, exactly (pipeline/pieces.ts reads the env). Unset (every normal build, the weekly refresh and
 * rebuild-release) the published output is byte-identical to what it was before the switch existed.
 */
export function headlineFromTrunkEnabled(envValue: string | undefined): boolean {
  return envValue === '1';
}

/**
 * CIV-1959 B2 (#1620, #1086): the pipeline switch for "one reading per piece, with Arm A": ATLAS_PIECE_READING=1, exactly
 * (pipeline/pieces.ts reads the env). It publishes the piece reading as a parallel field (piecePeriodHeadways) for the map's
 * stretch colour and never changes a stop's own published value. Unset (every normal build, the weekly refresh and
 * rebuild-release) the published output is byte-identical to what it was before the switch existed.
 */
export function pieceReadingEnabled(envValue: string | undefined): boolean {
  return envValue === '1';
}

/**
 * CIV-1959 B3 (#1620, #1086): the pipeline switch for "each branch gets its own reading on the cards, and a piece with too few
 * trips is limited": ATLAS_BRANCH_READINGS=1, exactly (pipeline/pieces.ts reads the env). It publishes one new field
 * (pieceReadings) and changes nothing else. Unset (every normal build, the weekly refresh and rebuild-release) the published
 * output is byte-identical to what it was before the switch existed. The client switch is BRANCH_READINGS_ENABLED.
 */
export function branchReadingsEnabled(envValue: string | undefined): boolean {
  return envValue === '1';
}

/**
 * CIV-1959 B4 (#1620, #1086): the pipeline switch for "pieces come from which trips serve them, with no 5-stop / 1 km minimum":
 * ATLAS_PIECES_BY_TRIPS=1, exactly (pipeline/pieceParams.ts reads the env). A change in the trip set is a new piece, and a
 * one-stop branch is still a piece. Unset (every normal build, the weekly refresh and rebuild-release) the published output
 * is byte-identical to what it was before the switch existed.
 */
export function piecesByTripsEnabled(envValue: string | undefined): boolean {
  return envValue === '1';
}
