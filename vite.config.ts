import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, statSync, createReadStream } from 'fs';
import { resolve } from 'path';
import { DEFAULT_R2_PUBLIC_URL } from './shared/config';

// https://vitejs.dev/config/
// base: '/' for local dev and Vercel, '/Atlas/' for GitHub Pages
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const r2Target = (env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');

  // Dev-only: serve a locally dry-run-built atlas.pmtiles (see
  // `npm run build-pmtiles-incremental -- <slug> --dry-run`) instead of proxying
  // to production R2, so a not-yet-published agency's map tiles can be previewed
  // before ever writing to the live bucket. Falls through to the normal proxy
  // when no override file is present (the common case) -- see docs/ADDING_AGENCIES.md.
  const PMTILES_PREVIEW_PATH = resolve('tmp/atlas-pmtiles-preview.pmtiles');
  const localPmtilesPreview: Plugin = {
    name: 'local-pmtiles-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname !== '/atlas-data/atlas.pmtiles' || !existsSync(PMTILES_PREVIEW_PATH)) return next();

        const { size } = statSync(PMTILES_PREVIEW_PATH);
        const range = req.headers.range;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'application/octet-stream');
        // Without this, the browser can cache individual byte-range responses
        // indefinitely (no ETag/Last-Modified to invalidate against), so
        // rebuilding this file mid-session can silently keep serving stale
        // tile data even after a hard reload.
        res.setHeader('Cache-Control', 'no-store');

        if (!range) {
          res.setHeader('Content-Length', String(size));
          createReadStream(PMTILES_PREVIEW_PATH).pipe(res);
          return;
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) { res.statusCode = 416; res.end(); return; }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : size - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        createReadStream(PMTILES_PREVIEW_PATH, { start, end }).pipe(res);
      });
    },
  };

  // Dev-only: serve an agency's dry-run process artifacts (see `npm run process
  // -- <feed> <slug> ... --dry-run`) instead of proxying to R2, whenever a local
  // preview file exists for that exact filename — same override-if-present,
  // fall-through-otherwise philosophy as localPmtilesPreview above. Lets a
  // candidate agency (even one already added to public/data/index.json for local
  // testing) be looked at locally before anything is uploaded. Clear
  // tmp/process-preview/<slug>/ to go back to fetching that slug's real R2 data.
  const PROCESS_PREVIEW_DIR = resolve('tmp/process-preview');
  const localAgencyDataPreview: Plugin = {
    name: 'local-agency-data-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        // getAgencyDataUrl() builds `${R2_PUBLIC_URL}/atlas/<slug>...json`, and in
        // dev R2_PUBLIC_URL is same-origin `/atlas-data` (see getR2PublicUrl in
        // shared/config.ts) -- so the real request path always has this extra
        // `atlas/` segment. Matching without it meant this middleware silently
        // never intercepted anything, falling through to the R2 proxy (a 404 for
        // any not-yet-published agency) for the entire time it's existed.
        const match = /^\/atlas-data\/atlas\/([\w-]+\.json)$/.exec(pathname);
        if (!match) return next();
        const filename = match[1];
        const slug = filename.replace(/-(stops-meta|stops|corridors|trips)\.json$/, '').replace(/\.json$/, '');
        const candidate = resolve(PROCESS_PREVIEW_DIR, slug, filename);
        if (!existsSync(candidate)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(candidate).pipe(res);
      });
    },
  };

  return {
    base: process.env.GITHUB_ACTIONS ? '/Atlas/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      localPmtilesPreview,
      localAgencyDataPreview,
    ],
    server: {
      port: 5100,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        },
        // R2 blocks browser CORS from localhost — proxy artifact fetches in dev.
        '/atlas-data': {
          target: r2Target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/atlas-data/, ''),
        },
      },
      historyApiFallback: true,
    },
  };
});
