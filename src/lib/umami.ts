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

/** #1519: Umami gets the address without the map's lat and lon, as Google and Vercel do. */
export function umamiBeforeSend(_type: string, payload: { url?: string } & Record<string, unknown>) {
  if (typeof payload?.url !== 'string') return payload;
  const full = withoutMapPosition(new URL(payload.url, 'https://atlas.invalid').toString());
  const u = new URL(full);
  return { ...payload, url: `${u.pathname}${u.search}${u.hash}` };
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
