/**
 * Every limit and fixed size Atlas uses, in one place (rules audit 4.1, move 7): the public API rate limit, search-result
 * text lengths, the default map view and its padding, the zoom steps, the zoom where detailed data starts, and the
 * earth's radius. Imports nothing, so any bundle, the pipeline and the scripts can read it.
 */

/** Default public API budget: requests per window, per IP. In-memory only, so it resets per Vercel isolate. */
export const DEFAULT_RATE_LIMIT = 60;
export const DEFAULT_RATE_WINDOW_MS = 60_000;

/** Search-result text limits: titles are cut at about 60 characters, descriptions at about 155 to 160. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const DESCRIPTION_MIN = 110;
/** Browser tab titles stay within this many characters (search results cut the rest): the search title limit. */
export const TAB_TITLE_MAX = TITLE_MAX;

/** Default map center when no saved view (GTHA), [lat, lon]. */
export const DEFAULT_MAP_CENTER: [number, number] = [43.65, -79.45];
export const DEFAULT_MAP_ZOOM = 11;
/** The map's frequency filter when no link or saved choice sets one: every 60 min or better. The Filters count leaves it out. */
export const DEFAULT_MAX_HEADWAY = 60;

/** Bbox padding from agency center when index.json has no explicit bbox. */
export const AGENCY_BBOX_PAD = { lat: 0.4, lon: 0.5 } as const;
/** Initial viewport padding around center. */
export const VIEWPORT_BBOX_PAD = { lat: 0.5, lon: 0.6 } as const;
/** Agency chip visibility check padding. */
export const AGENCY_CHIP_PAD = 0.5;

/** A zoom step's max headway that means "no limit": every route shows. */
export const NO_HEADWAY_LIMIT = 9999;
/** A route-list headway at or above this is a no-service marker, not a spacing (the route list, its filter and the MCP). */
export const HEADWAY_NO_SERVICE_FROM = 999;
/** Runtime map zoom gate: [zoom threshold, max headway] steps after the sub-zoom-7 default (10 min). */
export const MAP_ZOOM_HEADWAY_STEPS: ReadonlyArray<readonly [zoom: number, maxHeadway: number]> = [
  [7, 20],
  [9, NO_HEADWAY_LIMIT],
];
export const MAP_ZOOM_DEFAULT_MAX_HEADWAY = 10;

/** How far the map's Nearby panel looks for routes from a point, in metres (its "No routes within 500 m" too). */
export const NEARBY_ROUTES_RADIUS_M = 500;
/** A feed whose schedule ends within this many days counts as expiring: the expiring-feeds check peeks at it, and the MCP warns beside its figures (CIV-2081). */
export const FEED_EXPIRING_DAYS = 7;
/** The most agencies one rank_agencies answer lists: each reads a file, and the hosted MCP's plan allows 50 reads a call. */
export const RANK_AGENCIES_MAX = 30;
/** How often the MCP servers re-read a published release's pointer (the data release, the on-demand zones). */
export const MCP_POINTER_RECHECK_MS = 60_000;

/** The zoom from which an agency's detailed GeoJSON loads. */
export const DETAIL_GEOJSON_MIN_ZOOM = 8;

/** The earth's mean radius in metres, the one sphere every distance is measured on. */
export const EARTH_RADIUS_M = 6_371_000;
/** The same radius in kilometres. */
export const EARTH_RADIUS_KM = EARTH_RADIUS_M / 1000;
