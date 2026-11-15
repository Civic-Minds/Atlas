import { sharePreviewHtml } from '../shared/sharePreview.js';
import type { ApiRequest } from '../shared/request.js';
import type { ApiResponse } from '../shared/http.js';
import type { SeoMode } from '../shared/seo.js';

/**
 * Link preview for a shared map link with a place in it (CIV-1175). vercel.json sends only social preview bots
 * here, and only for links with ?lat= or ?area=, so people never run this function. Never cached: a person opening
 * the same link must always get the real page, and bots fetch each link only a few times.
 */
export const SHARE_PREVIEW_CACHE = 'no-store';

function deploymentMode(): SeoMode {
  const mode = process.env.VITE_ATLAS_MODE;
  if (mode === 'public' || mode === 'preview' || mode === 'beta' || mode === 'dev') return mode;
  if (process.env.VITE_PREVIEW_BUILD === 'true') return 'preview';
  return process.env.VITE_BETA_BUILD === 'true' ? 'beta' : 'public';
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  const url = new URL(req.url ?? '/', 'https://atlas.invalid');
  // The rewrite passes the shared link's own query through; drop the rewrite's bookkeeping, if any.
  url.searchParams.delete('path');
  const mode = deploymentMode();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', SHARE_PREVIEW_CACHE);
  res.end(sharePreviewHtml({ search: url.search, mode }));
}
