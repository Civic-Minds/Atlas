/**
 * CIV-2894 (Ryan, 2026-11-24): where the Live page reads its vehicles: the cloud recorder (CIV-2073 v2 snapshots) through
 * the read-only atlas-live-read Worker (workers/atlas-live-read), so /apps/live needs nothing running on the Mac. One place
 * for the URL and the origins it answers.
 */
import { LIVE_POLLING_ROUTES } from './livePollingConfig.js';
import { RECORDER_SLUGS } from './liveArchiveFeeds.js';

/** The Worker's address (workers.dev). */
export const LIVE_CLOUD_ORIGIN = 'https://atlas-live-read.rhanna-334.workers.dev';

/** CIV-2939: the cloud reader's path for an agency's latest whole-network vehicle count (Fleet's "In service now"). */
export const LIVE_NETWORK_COUNT_PATH = '/live/network-count';
/** Its URL for an agency. */
export const liveCloudNetworkCountUrl = (slug: string) => `${LIVE_CLOUD_ORIGIN}${LIVE_NETWORK_COUNT_PATH}?agency=${encodeURIComponent(slug)}`;

/** The cloud reader's URL for an agency's vehicles. */
export const liveCloudVehiclesUrl = (slug: string) => `${LIVE_CLOUD_ORIGIN}/live/vehicles?agency=${encodeURIComponent(slug)}`;

/** Atlas's own sites and any localhost port (the dev servers). */
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*transitatlas\.fyi|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/** The origin to echo in Access-Control-Allow-Origin, or null for any other caller. */
export const liveVehiclesCorsOrigin = (origin: string | null): string | null => (origin && ALLOWED_ORIGIN.test(origin) ? origin : null);

/**
 * CIV-2914: the agencies the public cloud reader answers for: only those Live shows (its polling config). An agency the
 * recorder keeps for analysis only (Kingston, the Studio demo, private under CIV-1716; MBTA, DRT, Brampton) is never served.
 */
export const liveCloudServes = (slug: string): boolean => LIVE_POLLING_ROUTES.some(r => r.slug === slug);
/** Vehicles also need the recorder to cover the agency. */
export const liveCloudServesVehicles = (slug: string): boolean => liveCloudServes(slug) && RECORDER_SLUGS.includes(slug);

/** The cloud reader's URLs for a route's Live files (CIV-2914), in place of the local API's /api/live-*. */
/** The Live analysis reads atlas-live-read serves besides vehicles (CIV-2914). */
export type LiveCloudRead = 'segments' | 'dashboard' | 'recent' | 'agency' | 'gaps' | 'stop';
export const liveCloudUrl = (what: LiveCloudRead, params: Record<string, string>) =>
  `${LIVE_CLOUD_ORIGIN}/live/${what}?${new URLSearchParams(params).toString()}`;
