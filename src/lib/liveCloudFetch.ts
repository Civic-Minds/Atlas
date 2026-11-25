/**
 * CIV-2914: the Live card's reads go to the cloud reader (atlas-live-read), so nothing on the Mac is needed. The cloud
 * answers 404 for an agency Live doesn't show (Kingston, Studio's private demo, CIV-1716): only in a dev build is that
 * one asked of the local API instead, for Studio's own pages.
 */
import { liveCloudUrl, type LiveCloudRead } from '../../shared/liveCloud';

export async function liveCloudFetch(what: LiveCloudRead, params: Record<string, string>): Promise<Response> {
  const res = await fetch(liveCloudUrl(what, params));
  if (res.status !== 404 || !import.meta.env.DEV) return res;
  return fetch(`/api/live-${what}?${new URLSearchParams(params).toString()}`);
}
