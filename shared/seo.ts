/**
 * Search and sharing metadata for every route, in one place.
 *
 * The browser (runtime hook), the build-time prerender and the sitemap script all read this
 * table, so a route's title, description and canonical cannot drift between them. Keep this file
 * free of import.meta and DOM access so plain Node scripts can load it.
 */

export const SITE_URL = 'https://www.transitatlas.fyi';
export const SITE_NAME = 'Transit Atlas';
export const ORG_NAME = 'Civic Minds';

export type SeoGate = 'researchApps' | 'whatsNew' | 'live' | 'history' | 'agencyPages';
export type SeoMode = 'public' | 'preview' | 'beta' | 'dev';
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
}

const HOME_DESCRIPTION =
  'See how often transit routes actually run. Atlas maps scheduled frequency by agency, day and time of day, using published agency schedules.';

export const SEO_ROUTES: readonly SeoRoute[] = [
  {
    path: '/',
    title: 'Transit Atlas: scheduled frequency map',
    description: HOME_DESCRIPTION,
    indexable: true,
    includeInSitemap: true,
  },
  {
    path: '/apps/frequency',
    title: 'Transit Atlas: scheduled frequency map',
    description: HOME_DESCRIPTION,
    indexable: true,
    canonicalPath: '/',
  },
  {
    path: '/about',
    title: 'About Transit Atlas: frequency maps for planners',
    description:
      'Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency and place. Built by Civic Minds for riders, planners and researchers.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: '/about/docs',
    title: 'How Transit Atlas works: data, frequency and methods',
    description:
      'How Atlas turns published transit schedules into frequency maps: the data it uses, how frequency is measured, how service is classified and how errors are corrected.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: '/privacy',
    title: 'Privacy policy: Transit Atlas',
    description: 'What Transit Atlas collects, how analytics and location are handled, and how to ask for your information to be removed.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: '/terms',
    title: 'Terms of service: Transit Atlas',
    description: 'The terms for using Transit Atlas, including what its scheduled-service data can and cannot be relied on for.',
    indexable: true,
    prerender: true,
    includeInSitemap: true,
  },
  {
    path: '/apps/history',
    title: 'Service history: Transit Atlas',
    description: 'See how scheduled transit service changed over time, using dated snapshots of agency schedules.',
    indexable: false,
    gate: 'history',
  },
  {
    path: '/apps/live',
    title: 'Live vehicles: Transit Atlas',
    description: 'Compare live vehicle positions with scheduled service on the Atlas map.',
    indexable: false,
    gate: 'live',
  },
  {
    path: '/research/night',
    title: 'Night service: Transit Atlas',
    description: 'Find routes with sustained scheduled service between 2am and 6am.',
    indexable: false,
    gate: 'researchApps',
  },
  {
    path: '/research',
    title: 'Research: Transit Atlas',
    description: 'Research tools that show the service patterns the everyday frequency map cannot show on its own.',
    indexable: false,
    gate: 'researchApps',
    prerender: true,
  },
  {
    path: '/research/frequent-service',
    title: 'Frequent service map: Transit Atlas',
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
  },
  {
    path: '/changelog',
    title: 'Changelog: Transit Atlas',
    description: 'Every Atlas version and map data update, newest first.',
    indexable: false,
    gate: 'whatsNew',
  },
];

/** Routes the router knows but that are never reachable by URL (they redirect to the map). */
export const UNREACHABLE_APP_PATHS: readonly string[] = ['/apps/fares'];

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
  const prefix = ctx.mode === 'preview' ? '[Preview] ' : ctx.mode === 'public' ? '' : '[Beta] ';
  const canonicalPath = route.canonicalPath ?? route.path;
  return {
    title: `${prefix}${route.title}`,
    description: route.description,
    canonicalUrl: `${origin}${canonicalPath === '/' ? '/' : canonicalPath}`,
    // Beta, preview and dev builds are staging copies: never indexed, on any route.
    noindex: !publicBuild || !route.indexable,
    matchedPath: route.path,
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/** Swap a page's own head tags for a route's, leaving everything else in index.html alone. */
export function applySeoToHtml(html: string, seo: ResolvedSeo): string {
  let out = html;
  for (const pattern of OWNED_TAG_PATTERNS) out = out.replace(pattern, '');
  return out.replace('</head>', `${renderSeoTags(seo)}\n</head>`);
}

/** Put prerendered markup inside the app root. */
export function injectRootHtml(html: string, markup: string): string {
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html has no empty #root to fill');
  return html.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
}

/** Pages whose text is rendered into static HTML in this build. */
export function prerenderRoutes(flags: SeoFlags): SeoRoute[] {
  return SEO_ROUTES.filter(r => r.prerender && routeExistsInBuild(r, flags));
}

export function sitemapRoutes(): SeoRoute[] {
  return SEO_ROUTES.filter(r => r.indexable && r.includeInSitemap);
}

/** `extraUrls` are absolute URLs added by a build whose flags enable more pages (agency pages). */
export function buildSitemapXml(extraUrls: readonly string[] = []): string {
  const urls = [...sitemapRoutes().map(r => `${SITE_URL}${r.path === '/' ? '/' : r.path}`), ...extraUrls]
    .map(loc => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Every path the router can answer, with and without a trailing slash, for vercel.json. */
/** Agency pages are prerendered per slug; vercel.json serves each from its own file (404 if absent). */
export const AGENCY_ROUTE_SOURCES: readonly string[] = ['/agency/:slug', '/agency/:slug/'];
/** Same for metro area pages (/area/<slug>). */
export const AREA_ROUTE_SOURCES: readonly string[] = ['/area/:slug', '/area/:slug/'];

export function knownRouteSources(): string[] {
  const paths = [...SEO_ROUTES.map(r => r.path), ...UNREACHABLE_APP_PATHS].filter(p => p !== '/');
  return ['/', ...paths.flatMap(p => [p, `${p}/`])];
}
