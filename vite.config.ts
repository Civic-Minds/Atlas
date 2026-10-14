import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, statSync, createReadStream } from 'fs';
import { resolve } from 'path';
import { DEFAULT_BETA_R2_PUBLIC_URL, DEFAULT_R2_PUBLIC_URL } from './shared/config';

// https://vitejs.dev/config/
// base: '/' for local dev and Vercel, '/Atlas/' for GitHub Pages
// Dev server only (never `vite build`, so Vercel and CI are unaffected): fail
// loudly when .env.local is missing, instead of starting a server whose map
// silently lacks the local settings. Worktrees symlink it to the main
// checkout's .env.dev-public (no R2 write keys), never to its full .env.local.
function assertDevEnv(env: Record<string, string>): void {
  if (process.env.ATLAS_SKIP_ENV_CHECK === '1') return;
  const missing: string[] = [];
  if (!existsSync(resolve('.env.local'))) missing.push('.env.local file');
  if (!process.env.R2_PUBLIC_URL && !env.R2_PUBLIC_URL && !env.VITE_R2_PUBLIC_URL) missing.push('R2_PUBLIC_URL');
  if (missing.length === 0) return;
  const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
  throw new Error(red([
    `[atlas] Dev env missing: ${missing.join(', ')}.`,
    'In a worktree, link the dev-only settings (no R2 write keys) from the main checkout:',
    '  ln -s <main checkout>/.env.dev-public .env.local',
    'New worktrees: scripts/new-worktree.sh <name> <branch> does this for you.',
    'Set ATLAS_SKIP_ENV_CHECK=1 to start anyway.',
  ].join('\n')));
}

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'serve' && !isPreview && !process.env.VITEST) assertDevEnv(env);
  // Prefer process.env so `ATLAS_ENV=staging` / `VITE_R2_PUBLIC_URL=…` (npm run
  // dev:staging) can point the /atlas-data proxy at the staging bucket without
  // editing .env.local. Fall back to Vite-loaded env, then prod default.
  const r2Target = (
    process.env.VITE_R2_PUBLIC_URL
    || process.env.R2_PUBLIC_URL
    || env.VITE_R2_PUBLIC_URL
    || env.R2_PUBLIC_URL
    || DEFAULT_R2_PUBLIC_URL
  ).replace(/\/$/, '');
  const betaR2Target = (
    process.env.VITE_BETA_R2_PUBLIC_URL
    || env.VITE_BETA_R2_PUBLIC_URL
    || DEFAULT_BETA_R2_PUBLIC_URL
  ).replace(/\/$/, '');
  // The inline script in index.html starts the release lookup before the app code loads. It must use
  // the same data URL the app resolves (VITE_R2_PUBLIC_URL, else the default); dev builds leave the
  // placeholder alone and the script does nothing.
  const clientR2Url = (process.env.VITE_R2_PUBLIC_URL || env.VITE_R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
  const earlyDataUrl: Plugin = {
    name: 'early-data-url',
    apply: 'build',
    transformIndexHtml: html => html
      .replace('__ATLAS_R2_PUBLIC_URL__', clientR2Url)
      // Map tiles always come from the public domain (see PMTILES_PUBLIC_URL in src/lib/dataRelease.ts).
      .replace('__ATLAS_PMTILES_URL__', DEFAULT_R2_PUBLIC_URL.replace(/\/$/, '')),
  };
  // Local dry-run artifacts are opt-in so ignored, potentially stale files cannot silently
  // replace the live R2 data during ordinary localhost testing.
  const useLocalPreviews = (
    process.env.VITE_USE_LOCAL_PREVIEWS
    || env.VITE_USE_LOCAL_PREVIEWS
  ) === 'true';
  if (process.env.ATLAS_ENV === 'staging' || /pub-5f1c48f86b024c42a8d174a4a5dd69ca/.test(r2Target)) {
    console.log(`[vite] /atlas-data proxy → ${r2Target} (staging)`);
  }

  // Dev-only: serve locally dry-run-built PMTiles archives (see
  // `npm run build-pmtiles-incremental -- <slug> --dry-run`) instead of proxying
  // to production R2, so a not-yet-published agency's map tiles can be previewed
  // before ever writing to the live bucket. Falls through to the normal proxy
  // when no override file is present (the common case) -- see docs/ADDING_AGENCIES.md.
  const PMTILES_PREVIEW_PATH = resolve('tmp/atlas-pmtiles-preview.pmtiles');
  const PREVIEW_MANIFEST_PATH = resolve('tmp/atlas-preview-manifest.json');
  const PREVIEW_AGENCY_DIR = resolve('tmp/geojson-build/release-agencies');
  const localPmtilesPreview: Plugin = {
    name: 'local-pmtiles-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname === '/atlas-data/atlas/release.json') {
          if (!existsSync(PREVIEW_MANIFEST_PATH)) return next();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(PREVIEW_MANIFEST_PATH).pipe(res);
          return;
        }
        const agencyMatch = /^\/atlas-data\/atlas\/preview-agencies\/([\w-]+\.json)$/.exec(pathname);
        if (agencyMatch) {
          const candidate = resolve(PREVIEW_AGENCY_DIR, agencyMatch[1]);
          if (!existsSync(candidate)) return next();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(candidate).pipe(res);
          return;
        }
        const isOverview = pathname === '/atlas-data/atlas-overview.pmtiles';
        if (pathname !== '/atlas-data/atlas.pmtiles' && !isOverview) return next();
        // A local PMTiles file without its matching release manifest is unsafe:
        // it would be paired with live agency JSON and recreate map/card drift.
        if (!existsSync(PREVIEW_MANIFEST_PATH)) return next();
        const previewPath = isOverview
          ? resolve('tmp/atlas-overview-pmtiles-preview.pmtiles')
          : PMTILES_PREVIEW_PATH;
        if (!existsSync(previewPath)) return next();

        const { size } = statSync(previewPath);
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
          createReadStream(previewPath).pipe(res);
          return;
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) { res.statusCode = 416; res.end(); return; }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : size - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        createReadStream(previewPath, { start, end }).pipe(res);
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
    define: {
      // Vercel provides the commit that produced each deployment. The beta client uses this
      // value to tell whether an already-open tab is running an older build.
      __ATLAS_BUILD_ID__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'local',
      ),
    },
    base: process.env.GITHUB_ACTIONS ? '/Atlas/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      earlyDataUrl,
      ...(useLocalPreviews ? [localPmtilesPreview, localAgencyDataPreview] : []),
    ],
    // MapLibre spawns its worker as `type: 'module'` (see src/lib/mapStyle.ts).
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        output: {
          // Map/render libraries change far less often than app code — keeping
          // them in their own file lets returning visitors reuse the cached
          // copy instead of re-downloading it on every deploy.
          manualChunks(id) {
            if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
            if (id.includes('node_modules/@deck.gl')) return 'deck';
          },
        },
      },
    },
    // MapLibre 6 loads its worker from a sibling file next to the module;
    // Vite's dep pre-bundling drops that file, so routes never render in dev.
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
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
        '/beta-data': {
          target: betaR2Target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/beta-data/, ''),
        },
      },
      historyApiFallback: true,
    },
  };
});
