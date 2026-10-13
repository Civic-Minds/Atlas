/**
 * Post-build step: writes dist/<route>/index.html for the static pages, with the page's real
 * text inside #root and its own title, canonical and robots tags. The app still mounts over it.
 * Run after `vite build` and `vite build --ssr src/prerender.tsx --outDir .prerender`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, applySeoToHtml, buildSitemapXml, injectRootHtml, prerenderRoutes, resolveSeo } from '../shared/seo';
import { agencyPageJsonLd, agencyPagePath, resolveAgencySeo } from '../shared/agencyPages';
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';

const dist = resolve('dist');
const mod = await import(pathToFileURL(resolve('.prerender/prerender.js')).href);
const shell = readFileSync(join(dist, 'index.html'), 'utf8');
// Staging builds are never canonical to production; describe the host they are served from.
const origin = mod.BUILD_MODE === 'public' ? SITE_URL : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL;

for (const route of prerenderRoutes(mod.BUILD_FLAGS)) {
  if (!mod.PRERENDER_PATHS.includes(route.path)) throw new Error(`${route.path} is in the route table but has no prerender page`);
  const seo = resolveSeo(route.path, { mode: mod.BUILD_MODE, flags: mod.BUILD_FLAGS, origin });
  const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderPage(route.path));
  const file = join(dist, route.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`Prerendered ${route.path}`);
}

// Agency pages: beta and dev builds only. They read the committed summary file, never R2, so an
// unreachable R2 cannot fail the build. An empty or missing summary skips them, loudly.
if (mod.BUILD_FLAGS.agencyPages) {
  const agencies = agencyPageSummaries();
  if (agencies.length === 0) {
    console.warn('\n!!! AGENCY PAGES SKIPPED: shared/data/agency-pages.json has no agencies. Run scripts/build-agency-page-summaries.ts. !!!\n');
  } else {
    const urls: string[] = [];
    for (const a of agencies) {
      const seo = resolveAgencySeo(a, { mode: mod.BUILD_MODE, origin });
      const ld = `  <script type="application/ld+json">${JSON.stringify(agencyPageJsonLd(a, seo.canonicalUrl, origin)).replace(/</g, '\\u003c')}</script>\n</head>`;
      const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderAgencyPage(a.slug)).replace('</head>', () => ld);
      const file = join(dist, agencyPagePath(a.slug), 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      urls.push(seo.canonicalUrl);
    }
    // The committed public/sitemap.xml stays public-only; this build's copy also lists agency pages.
    writeFileSync(join(dist, 'sitemap.xml'), buildSitemapXml(urls));
    console.log(`Prerendered ${agencies.length} agency pages (data release ${AGENCY_PAGE_DATA.releaseId}); sitemap.xml updated`);
  }
}
