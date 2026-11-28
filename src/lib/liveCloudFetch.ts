/**
 * CIV-2914: the Live card's reads go to the cloud reader (atlas-live-read), so nothing on the Mac is needed. The cloud
 * answers 404 for an agency Live doesn't show (Kingston, Studio's private demo, CIV-1716): only in a dev build is that
 * one asked of the local API instead, for Studio's own pages.
 *
 * CIV-3173 (#1939): every Live read in the app goes through liveRead, so Studio's private agencies load the same way for
 * vehicles, the agency file, the route file and the gaps as for the card's other reads. Before, only some reads asked the
 * local API, and Studio said "Live doesn't cover any Kingston Transit routes" while offering Kingston.
 */
import { LIVE_CLOUD_ORIGIN, liveCloudUrl, type LiveCloudRead } from '../../shared/liveCloud';

/** The local API's address for a cloud reader address (`…/live/agency?agency=kingston` → `/api/live-agency?agency=kingston`), else null. */
export function localLiveUrl(url: string): string | null {
  if (!url.startsWith(`${LIVE_CLOUD_ORIGIN}/live/`)) return null;
  const u = new URL(url);
  return `/api/live-${u.pathname.slice('/live/'.length)}${u.search}`;
}

/** Fetch a Live read; in a dev build, a cloud 404 (an agency the public reader never serves) is asked of the local API. */
export async function liveRead(url: string): Promise<Response> {
  const res = await fetch(url);
  const local = res.status === 404 && import.meta.env.DEV ? localLiveUrl(url) : null;
  return local ? fetch(local) : res;
}

export async function liveCloudFetch(what: LiveCloudRead, params: Record<string, string>): Promise<Response> {
  return liveRead(liveCloudUrl(what, params));
}
