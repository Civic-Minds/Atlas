/**
 * Search and sharing metadata for every route, in one place.
 *
 * The browser (runtime hook), the build-time prerender and the sitemap script all read this
 * table, so a route's title, description and canonical cannot drift between them. Keep this file
 * free of import.meta and DOM access so plain Node scripts can load it.
 */

import { LIVE_VEHICLES_TITLE } from './liveWording';
import { FREQUENT_SERVICE_TITLE } from './frequentService';
import { PAGE_NAMES, tabTitle } from './pageNames';
import { titleCase } from './titleCase';
import { ABOUT_PATH, CHANGELOG_PATH, DOCS_PATH, LIVE_PATH, PLANNERS_PATH, PRIVACY_PATH, RESEARCH_PATH, TERMS_PATH } from './pagePaths';

export const SITE_URL = 'https://www.transitatlas.fyi';
/** The beta site, where beta-only agencies and services can be seen (never the preview site, which is for agencies' own previews). */
export const BETA_SITE_URL = 'https://beta.transitatlas.fyi';
/** The preview site, for agencies' own previews (preview.transitatlas.fyi). */
export const PREVIEW_SITE_URL = 'https://preview.transitatlas.fyi';
export { SITE_NAME } from './pageNames';
/** The home page's tab: the only one that leads with the brand (shared/pageNames.ts tabTitle). */
export const HOME_TITLE = 'Transit Atlas: Scheduled Frequency Map';
export const ORG_NAME = 'Civic Minds';

export type SeoGate = 'researchApps' | 'whatsNew' | 'live' | 'history' | 'agencyPages';
export type SeoMode = 'public' | 'preview' | 'beta' | 'dev';

/**
 * #1521: the address a build's prerendered canonicals and links use: each site's own stable domain, never the
 * per-deployment vercel.app address. A dev build falls back to its deployment address, then the public site.
 */
export function buildOrigin(mode: SeoMode, vercelUrl?: string): string {
  if (mode === 'public') return SITE_URL;
  if (mode === 'preview') return PREVIEW_SITE_URL;
  if (mode === 'beta') return BETA_SITE_URL;
  return vercelUrl ? `https://${vercelUrl}` : SITE_URL;
}
export type SeoFlags = Partial<Record<SeoGate, boolean>>;

export interface SeoRoute {
  path: string;
  title: string;
  description: string;
  /** Only routes ready for the public site are indexable; every other route gets noindex. */
  indexable: boolean;
  /** Flag the route needs. Without it the route does not exist in the build and shows the map. */
  gate?: SeoGate;
  /** Another path that holds the real page; this route's canonical points there. */
  canonicalPath?: string;
  /** Static page whose text is rendered into HTML at build time, in builds where the route exists. */
  prerender?: boolean;
  /** Listed in sitemap.xml (public, canonical pages only). */
  includeInSitemap?: boolean;
  /**
   * The page's own link-preview image (1200×630 PNG or JPEG under public/), in place of the site's. Pages without one keep the
   * site image from index.html. Research pages get theirs as Ryan picks them (CIV-1167).
   */
  shareImage?: { path: string; alt: string };
}

/** Every research page gets its own static file at build time, so a shared link shows its own preview (CIV-1167). */
export const RESEARCH_PATH_PREFIX = RESEARCH_PATH;

export const HOME_DESCRIPTION =
  'See how often transit routes actually run. Atlas maps scheduled frequency by agency, day and time of day, using published agency schedules.';

export const SEO_ROUTES: readonly SeoRoute[] = [
  {
    path: '/',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    indexable: true,
    includeInSitemap: true,
  },
  {
    path: '/apps/frequency',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    indexable: true,
    canonicalPath: '/',
  },
  {
    path: ABOUT_PATH,
    title: tabTitle(PAGE_NAMES.aboutPage, 'Frequency Maps for Planners'),
    description:
      'Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency and place, for riders, planners and researchers.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: DOCS_PATH,
    title: tabTitle(PAGE_NAMES.docs, 'Data, Frequency and Methods'),
    description:
      'How Atlas turns published schedules into frequency maps: its data, how frequency is measured, how service is classified and how errors are corrected.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    // CIV-1320: title and description are the page's own words.
    path: PLANNERS_PATH,
    title: 'For Transit Planners: Transit Atlas',
    description: 'Atlas shows how often transit really runs, across every agency in a region, on one map.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: PRIVACY_PATH,
    title: tabTitle(PAGE_NAMES.privacy),
    description: 'What Transit Atlas collects, how analytics and location are handled, and how to ask for your information to be removed.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: TERMS_PATH,
    title: tabTitle(PAGE_NAMES.terms),
    description: 'The terms for using Transit Atlas, including what its scheduled-service data can and cannot be relied on for.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: '/apps/history',
    title: tabTitle(PAGE_NAMES.serviceHistory),
    description: 'See how scheduled transit service changed over time, using dated snapshots of agency schedules.',
    indexable: false,
    gate: 'history',
  },
  {
    // Compare's own address: the frequency map split in two, so it keeps the map's title and points at the map.
    path: '/apps/compare',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    indexable: false,
    canonicalPath: '/',
  },
  {
    path: LIVE_PATH,
    title: tabTitle(titleCase(LIVE_VEHICLES_TITLE)),
    description: 'Compare live vehicle positions with scheduled service on the Atlas map.',
    indexable: false,
    gate: 'live',
  },
  {
    path: '/research/night',
    title: tabTitle('Overnight Service'),
    description: 'Find routes with sustained scheduled service from 2–5 AM.',
    indexable: false,
    gate: 'researchApps',
    // Ryan's pick 1 (CIV-1167), rendered from public/assets/research/share/night-light.svg.
    shareImage: { path: '/assets/research/share/night.png', alt: 'Overnight service' },
  },
  {
    path: RESEARCH_PATH,
    title: tabTitle(PAGE_NAMES.research),
    description: 'Research tools that show the service patterns the everyday frequency map cannot show on its own.',
    indexable: false,
    gate: 'researchApps',
    prerender: true,
  },
  {
    path: '/research/bustang-connections',
    title: tabTitle('Bustang Connections'),
    description: 'How long riders wait for a local bus after each Bustang arrival.',
    indexable: false,
    gate: 'researchApps',
  },
  {
    path: '/research/free-child-fares',
    title: tabTitle('Free Child Fares'),
    description: 'See up to what age children ride free at 697 transit agencies.',
    indexable: false,
    gate: 'researchApps',
    prerender: true,
  },
  {
    path: '/research/frequent-service',
    title: tabTitle('Frequent Service Map'),
    description: 'Routes that meet Atlas sustained-frequency thresholds, mapped across agencies.',
    indexable: false,
    gate: 'researchApps',
  },
  {
    path: '/research/frequent-service/story',
    title: 'What happens when you miss the bus? Transit Atlas',
    description: 'A source-backed look at what frequent service means across transit networks.',
    indexable: false,
    gate: 'researchApps',
    // Ryan's pick B4 (CIV-1167): bus 1303 at a real TTC shelter. Photo credits: public/assets/research/share/CREDITS.md.
    shareImage: { path: '/assets/research/share/frequent-light.png', alt: FREQUENT_SERVICE_TITLE },
  },
  {
    path: CHANGELOG_PATH,
    title: tabTitle(PAGE_NAMES.whatsNew),
    description: 'Every Atlas version and map data update, newest first.',
    indexable: false,
    gate: 'whatsNew',
  },
];

/** Routes the router knows but that are never reachable by URL (they redirect to the map). */
export const UNREACHABLE_APP_PATHS: readonly string[] = ['/apps/fares'];

/** The title's build tag: none on public, "[Preview] " on preview, "[Beta] " on beta and dev builds. */
export function seoTitlePrefix(mode: SeoMode): string {
  return mode === 'preview' ? '[Preview] ' : mode === 'public' ? '' : '[Beta] ';
}

export interface SeoContext {
  mode: SeoMode;
  flags: SeoFlags;
  /** Origin used for canonical and og:url. Defaults to the production site. */
  origin?: string;
}

export interface ResolvedSeo {
  title: string;
  description: string;
  canonicalUrl: string;
  noindex: boolean;
  /** The route that actually answered; '/' when the path is unknown or not in this build. */
  matchedPath: string;
  /** The route's own link-preview image, as an absolute URL; absent keeps the site image. */
  image?: { url: string; alt: string };
}

export function normalizePath(pathname: string): string {
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return withoutTrailing || '/';
}

export function findSeoRoute(pathname: string): SeoRoute | undefined {
  const path = normalizePath(pathname);
  return SEO_ROUTES.find(r => r.path === path);
}

/** True when this build actually serves the route's own page (not the map fallback). */
export function routeExistsInBuild(route: SeoRoute, flags: SeoFlags): boolean {
  return !route.gate || flags[route.gate] === true;
}

export function resolveSeo(pathname: string, ctx: SeoContext): ResolvedSeo {
  const origin = (ctx.origin ?? SITE_URL).replace(/\/$/, '');
  const found = findSeoRoute(pathname);
  const route = found && routeExistsInBuild(found, ctx.flags) ? found : SEO_ROUTES[0];
  const publicBuild = ctx.mode === 'public';
  const prefix = seoTitlePrefix(ctx.mode);
  const canonicalPath = route.canonicalPath ?? route.path;
  return {
    title: `${prefix}${route.title}`,
    description: route.description,
    canonicalUrl: `${origin}${canonicalPath === '/' ? '/' : canonicalPath}`,
    // Beta, preview and dev builds are staging copies: never indexed, on any route.
    noindex: !publicBuild || !route.indexable,
    matchedPath: route.path,
    // Always the production host: a preview bot must be able to fetch it, and deployment URLs can be protected.
    ...(route.shareImage ? { image: { url: `${SITE_URL}${route.shareImage.path}`, alt: route.shareImage.alt } } : {}),
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** og:image:type from the file name, so a JPEG is never announced as a PNG. */
export function imageMimeType(path: string): string {
  return /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.webp$/i.test(path) ? 'image/webp' : 'image/png';
}

/** The head tags a route owns, as HTML (used at build time). Mirrors applySeoToDocument. */
export function renderSeoTags(seo: ResolvedSeo): string {
  const t = escapeAttr(seo.title);
  const d = escapeAttr(seo.description);
  const u = escapeAttr(seo.canonicalUrl);
  const lines = [
    `<title>${escapeAttr(seo.title)}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ];
  if (seo.image) {
    const img = escapeAttr(seo.image.url);
    lines.push(
      `<meta property="og:image" content="${img}" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      `<meta property="og:image:type" content="${imageMimeType(seo.image.url)}" />`,
      `<meta property="og:image:alt" content="${escapeAttr(seo.image.alt)}" />`,
      `<meta name="twitter:image" content="${img}" />`,
    );
  }
  if (seo.noindex) lines.push('<meta name="robots" content="noindex" />');
  return lines.map(l => `  ${l}`).join('\n');
}

const OWNED_TAG_PATTERNS: RegExp[] = [
  /[ \t]*<title>[\s\S]*?<\/title>[ \t]*\n?/i,
  /[ \t]*<meta\s+name="description"[\s\S]*?\/>[ \t]*\n?/i,
  /[ \t]*<link\s+rel="canonical"[\s\S]*?\/>[ \t]*\n?/i,
  /[ \t]*<meta\s+property="og:(?:title|description|url)"[\s\S]*?\/>[ \t]*\n?/gi,
  /[ \t]*<meta\s+name="twitter:(?:title|description)"[\s\S]*?\/>[ \t]*\n?/gi,
  /[ \t]*<meta\s+name="robots"[\s\S]*?\/>[ \t]*\n?/gi,
];

/** The site image's tags, swapped out only when a route has its own image. */
const IMAGE_TAG_PATTERNS: RegExp[] = [
  /[ \t]*<meta\s+property="og:image(?::[a-z]+)?"[\s\S]*?\/>[ \t]*\n?/gi,
  /[ \t]*<meta\s+name="twitter:image"[\s\S]*?\/>[ \t]*\n?/gi,
];

/** Swap a page's own head tags for a route's, leaving everything else in index.html alone. */
export function applySeoToHtml(html: string, seo: ResolvedSeo): string {
  let out = html;
  for (const pattern of seo.image ? [...OWNED_TAG_PATTERNS, ...IMAGE_TAG_PATTERNS] : OWNED_TAG_PATTERNS) out = out.replace(pattern, '');
  return out.replace('</head>', `${renderSeoTags(seo)}\n</head>`);
}

/** Put prerendered markup inside the app root. */
export function injectRootHtml(html: string, markup: string): string {
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html has no empty #root to fill');
  return html.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
}

/** Research pages with no prerendered text in this build: each still gets its own file, for its link preview (CIV-1167). */
export function researchPreviewRoutes(flags: SeoFlags): SeoRoute[] {
  return shellRoutes(flags).filter(r => r.path === RESEARCH_PATH_PREFIX || r.path.startsWith(`${RESEARCH_PATH_PREFIX}/`));
}

/**
 * #1521: the app pages served from their own file (the app shell with the page's own title, description, robots and
 * canonical), so a crawler without JS reads that page's tags, never the map's. Only pages this build has: where a
 * page is off (History, Live and the research pages on the public site), no file is written and the address is a real
 * 404. The map's own addresses (/ and its aliases, which point their canonical at /) stay on app.html.
 */
export function shellRoutes(flags: SeoFlags): SeoRoute[] {
  const prerendered = new Set(prerenderRoutes(flags).map(r => r.path));
  return SEO_ROUTES.filter(r => r.path !== '/' && !r.canonicalPath && !prerendered.has(r.path) && routeExistsInBuild(r, flags));
}

/** Pages whose text is rendered into static HTML in this build. */
export function prerenderRoutes(flags: SeoFlags): SeoRoute[] {
  return SEO_ROUTES.filter(r => r.prerender && routeExistsInBuild(r, flags));
}

export function sitemapRoutes(): SeoRoute[] {
  return SEO_ROUTES.filter(r => r.indexable && r.includeInSitemap);
}

/** A sitemap URL, with its last change date (YYYY-MM-DD) where the page states one. */
export interface SitemapEntry { loc: string; lastmod?: string | null }

/** #1521: the date a page's JSON-LD says its data last changed (its Dataset's dateModified), for the sitemap. */
export function jsonLdDateModified(ld: object): string | null {
  for (const node of ((ld as { '@graph'?: Array<{ dateModified?: string }> })['@graph'] ?? [])) if (node?.dateModified) return node.dateModified;
  return null;
}

/** `extraUrls` are absolute URLs added by a build whose flags enable more pages (agency pages). */
export function buildSitemapXml(extraUrls: readonly (string | SitemapEntry)[] = []): string {
  const urls = [...sitemapRoutes().map(r => `${SITE_URL}${r.path === '/' ? '/' : r.path}`), ...extraUrls]
    .map(u => (typeof u === 'string' ? { loc: u } : u))
    // #1521: lastmod from the same date the page's own markup gives (dateModified), never a build date.
    .map(({ loc, lastmod }) => `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Every path the router can answer, with and without a trailing slash, for vercel.json. */
/** Agency pages are prerendered per slug; vercel.json serves each from its own file (404 if absent). */
export const AGENCY_ROUTE_SOURCES: readonly string[] = ['/agency/:slug', '/agency/:slug/'];
/** Same for metro area pages (/area/<slug>). */
export const AREA_ROUTE_SOURCES: readonly string[] = ['/area/:slug', '/area/:slug/'];
/** Same for state and province pages (/region/<slug>, CIV-976). */
export const REGION_ROUTE_SOURCES: readonly string[] = ['/region/:slug', '/region/:slug/'];

export function knownRouteSources(): string[] {
  const paths = [...SEO_ROUTES.map(r => r.path), ...UNREACHABLE_APP_PATHS].filter(p => p !== '/');
  return ['/', ...paths.flatMap(p => [p, `${p}/`])];
}
