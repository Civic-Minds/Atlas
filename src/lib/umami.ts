import { ATLAS_MODE } from '../../shared/config';
import { isInternalTestSession } from './internalTest';
import { withoutMapPosition } from './analytics';

/** CIV-2023 (Ryan, 2026-11-21): Umami Cloud, the website ID and script from the item. */
export const UMAMI_SCRIPT_SRC = 'https://cloud.umami.is/script.js';
export const UMAMI_WEBSITE_ID = '24317637-e033-43e1-9392-1769b1b58825';
const BEFORE_SEND = 'atlasUmamiBeforeSend';

declare global {
  interface Window { [BEFORE_SEND]?: (type: string, payload: { url?: string } & Record<string, unknown>) => unknown }
}

let lastPageviewPath: string | undefined;

/**
 * #1519: Umami gets the address without the map's lat and lon, as Google and Vercel do.
 * Umami counts a page view whenever the address changes, and the map rewrites the address on every pan or filter
 * change, so a page view whose page (path) hasn't changed is dropped (returning false cancels the send). This
 * matches Google Analytics, which counts one view per page from RouteTracker. Custom events always go through.
 */
export function umamiBeforeSend(type: string, payload: { url?: string; name?: unknown } & Record<string, unknown>) {
  if (typeof payload?.url !== 'string') return payload;
  const full = withoutMapPosition(new URL(payload.url, 'https://atlas.invalid').toString());
  const u = new URL(full);
  if (type === 'event' && !payload.name) {
    if (u.pathname === lastPageviewPath) return false;
    lastPageviewPath = u.pathname;
  }
  return { ...payload, url: `${u.pathname}${u.search}${u.hash}` };
}

/** Tests only: forget the last page counted. */
export function resetUmamiPageviewPath() {
  lastPageviewPath = undefined;
}

/**
 * Ryan, 2026-11-21 (CIV-2023): Umami loads for everyone, since it sets no cookies, so it isn't behind the analytics
 * prompt; public site only, never on localhost or ?atlas_internal=1 visits. Google Analytics keeps its consent flow.
 */
export function shouldLoadUmami(prod: boolean = import.meta.env.PROD, mode: string = ATLAS_MODE, internal: boolean = isInternalTestSession()): boolean {
  return prod && mode === 'public' && !internal;
}

let loaded = false;
export function loadUmami() {
  if (loaded || typeof document === 'undefined' || !shouldLoadUmami()) return;
  window[BEFORE_SEND] = umamiBeforeSend;
  const script = document.createElement('script');
  script.defer = true;
  script.src = UMAMI_SCRIPT_SRC;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  script.dataset.beforeSend = BEFORE_SEND;
  document.head.appendChild(script);
  loaded = true;
}
