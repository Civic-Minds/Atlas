/**
 * CIV-2894 (Ryan, 2026-11-24): where the Live page reads its vehicles: the cloud recorder (CIV-2073 v2 snapshots) through
 * the read-only atlas-live-read Worker (workers/atlas-live-read), so /apps/live needs nothing running on the Mac. One place
 * for the URL and the origins it answers.
 */
/** The Worker's address (workers.dev). */
export const LIVE_CLOUD_ORIGIN = 'https://atlas-live-read.rhanna-334.workers.dev';

/** The cloud reader's URL for an agency's vehicles. */
export const liveCloudVehiclesUrl = (slug: string) => `${LIVE_CLOUD_ORIGIN}/live/vehicles?agency=${encodeURIComponent(slug)}`;

/** Atlas's own sites and any localhost port (the dev servers). */
const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*transitatlas\.fyi|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

/** The origin to echo in Access-Control-Allow-Origin, or null for any other caller. */
export const liveVehiclesCorsOrigin = (origin: string | null): string | null => (origin && ALLOWED_ORIGIN.test(origin) ? origin : null);
