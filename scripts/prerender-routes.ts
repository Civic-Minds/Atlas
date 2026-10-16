/**
 * Post-build step: writes dist/<route>/index.html for the static pages, with the page's real
 * text inside #root and its own title, canonical and robots tags. The app still mounts over it.
 * Run after `vite build` and `vite build --ssr src/prerender.tsx --outDir .prerender`.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, applySeoToHtml, buildSitemapXml, injectRootHtml, prerenderRoutes, resolveSeo } from '../shared/seo';
import { AGENCY_DATA_SCRIPT_ID, agencyPageData, agencyPageJsonLd, agencyPagePath, resolveAgencySeo } from '../shared/agencyPages';
import { AGENCY_INDEX_DATA_SCRIPT_ID, AGENCY_INDEX_PATH, buildAgencyIndexData, resolveAgencyIndexSeo } from '../shared/agencyIndex';
import { AREA_DATA_SCRIPT_ID, areaPageJsonLd, buildAreaPageData, resolveAreaSeo } from '../shared/areaPages';
import { areaPagePath, type AreaConfig } from '../shared/areas';
import { AGENCY_PAGE_DATA, agencyPageSummaries } from '../shared/agencyPagesData';
import { liveReportPaths } from '../shared/liveReportPaths';
import { liveLinkPreview } from '../shared/liveLinkPreview';
import { DEFAULT_R2_PUBLIC_URL } from '../shared/config';

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
    // Metro areas (config/areas): pages only for areas flagged page: true. An agency links to its area.
    const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => JSON.parse(readFileSync(join('config/areas', f), 'utf8')) as AreaConfig).filter(a => a.page);
    const areaOf = new Map<string, { slug: string; name: string; bbox: AreaConfig['bbox'] }>();
    for (const area of areas) for (const slug of area.agencies) areaOf.set(slug, { slug: area.slug, name: area.name, bbox: area.bbox });
    const bySlug = new Map(agencies.map(x => [x.slug, x]));
    const areaMembers = new Map<string, typeof agencies>();
    for (const area of areas) {
      const members = area.agencies.map(s => bySlug.get(s)).filter((x): x is (typeof agencies)[number] => !!x);
      for (const m of members) areaMembers.set(m.slug, members);
    }
    for (const a of agencies) {
      const data = agencyPageData(a, agencies, AGENCY_PAGE_DATA.generatedAt, areaOf.get(a.slug), areaMembers.get(a.slug));
      const seo = resolveAgencySeo(a, { mode: mod.BUILD_MODE, origin, intro: data.intro });
      const embedded = `<script type="application/json" id="${AGENCY_DATA_SCRIPT_ID}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n</body>`;
      const ld = `  <script type="application/ld+json">${JSON.stringify(agencyPageJsonLd(a, seo.canonicalUrl, origin, data.area, data.intro)).replace(/</g, '\\u003c')}</script>\n</head>`;
      const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderAgencyPage(data)).replace('</head>', () => ld).replace('</body>', () => embedded);
      const file = join(dist, agencyPagePath(a.slug), 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      urls.push(seo.canonicalUrl);
    }
    const byslug = new Map(agencies.map(a => [a.slug, a]));
    for (const area of areas) {
      const data = buildAreaPageData(area, byslug, AGENCY_PAGE_DATA.generatedAt);
      if (data.agencies.length === 0) continue;
      const seo = resolveAreaSeo(data, { mode: mod.BUILD_MODE, origin });
      const embedded = `<script type="application/json" id="${AREA_DATA_SCRIPT_ID}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n</body>`;
      const ld = `  <script type="application/ld+json">${JSON.stringify(areaPageJsonLd(data, seo.canonicalUrl, origin)).replace(/</g, '\\u003c')}</script>\n</head>`;
      const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderAreaPage(data)).replace('</head>', () => ld).replace('</body>', () => embedded);
      const file = join(dist, areaPagePath(area.slug), 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      urls.push(seo.canonicalUrl);
    }
    // The index of every agency and area page, built from the same data (so new agencies and areas appear on their own).
    {
      const data = buildAgencyIndexData(agencies, areas, AGENCY_PAGE_DATA.generatedAt);
      const seo = resolveAgencyIndexSeo(data, { mode: mod.BUILD_MODE, origin });
      const embedded = `<script type="application/json" id="${AGENCY_INDEX_DATA_SCRIPT_ID}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n</body>`;
      const html = injectRootHtml(applySeoToHtml(shell, seo), mod.renderAgencyIndex(data)).replace('</body>', () => embedded);
      const file = join(dist, AGENCY_INDEX_PATH, 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      urls.push(seo.canonicalUrl);
    }
    // The committed public/sitemap.xml stays public-only; this build's copy also lists agency and area pages.
    writeFileSync(join(dist, 'sitemap.xml'), buildSitemapXml(urls));
    console.log(`Prerendered ${agencies.length} agency pages and ${areas.length} area pages (data release ${AGENCY_PAGE_DATA.releaseId}); sitemap.xml updated`);
  }
}

// Live report pages (builds with the Live reports switch on): one static page per published report, so a pasted
// link shows the route and its late share. Crawlers do not run JS; the app mounts over the page as usual. The figures
// come from the published agency summary on R2; if it cannot be read, the pages get the title alone.
if (mod.BUILD_LIVE_REPORTS) {
  const paths = liveReportPaths().filter(p => !p.endsWith('/'));
  const agencies = [...new Set(paths.map(p => p.split('/')[3]))];
  for (const agency of agencies) {
    const summary = await fetch(`${DEFAULT_R2_PUBLIC_URL}/atlas/live/${agency}/agency.json`, { signal: AbortSignal.timeout(15000) })
      .then(r => (r.ok ? r.json() : null)).then(d => d?.summary ?? null).catch(() => null);
    if (!summary) console.warn(`!!! Live link previews for ${agency}: no published summary; pages get the title only.`);
    for (const path of paths.filter(p => p.split('/')[3] === agency)) {
      const route = path.split('/')[4] ?? null;
      const preview = liveLinkPreview(agency, route, summary);
      const seo = { title: preview.title, description: preview.description, canonicalUrl: `${origin}${path}`, noindex: true, matchedPath: path };
      const file = join(dist, path, 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, applySeoToHtml(shell, seo));
    }
  }
  console.log(`Prerendered ${paths.length} Live report link previews`);
}
