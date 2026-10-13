import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SEO_ROUTES,
  SITE_URL,
  UNREACHABLE_APP_PATHS,
  applySeoToHtml,
  injectRootHtml,
  normalizePath,
  prerenderRoutes,
  resolveSeo,
  type SeoContext,
} from './seo';

const PUBLIC: SeoContext = { mode: 'public', flags: {} };
const BETA: SeoContext = {
  mode: 'beta',
  flags: { researchApps: true, whatsNew: true, live: false, history: true, corridors: true },
};

describe('route metadata table', () => {
  it('has a unique path, a title and a description for every route', () => {
    const paths = SEO_ROUTES.map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of SEO_ROUTES) {
      expect(r.path.startsWith('/')).toBe(true);
      expect(r.title.length).toBeGreaterThan(10);
      expect(r.title.length).toBeLessThanOrEqual(65);
      expect(r.description.length).toBeGreaterThan(40);
      expect(r.description.length).toBeLessThanOrEqual(200);
    }
  });

  it('gives every route its own title unless it is an alias of another', () => {
    const titles = SEO_ROUTES.filter(r => !r.canonicalPath).map(r => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('never makes a gated (beta-only) route indexable', () => {
    for (const r of SEO_ROUTES.filter(r => r.gate)) expect(r.indexable).toBe(false);
  });

  it('matches the paths the router serves in main.tsx and App.tsx', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    const routePaths: string[] = [...main.matchAll(/<Route path="(\/[^"*]*)"/g)].map(m => m[1])
      .filter(p => !p.startsWith('/apps/diagnostics') && p !== '/agency/:slug' && p !== '/area/:slug');
    routePaths.splice(0, routePaths.length, ...routePaths.filter(p => p !== '/agencies')); // the agency index is prerendered per build, like agency pages
    const appPaths = [...app.matchAll(/'(\/apps\/[a-z]+)':/g)].map(m => m[1]);
    const research = [...readFileSync('shared/config.ts', 'utf8').matchAll(/: '(\/research[^']*)'/g)].map(m => m[1]);
    const known = new Set([...SEO_ROUTES.map(r => r.path), ...UNREACHABLE_APP_PATHS]);
    for (const p of [...routePaths, ...appPaths, ...research, '/']) expect(known.has(p), p).toBe(true);
    const served = new Set([...routePaths, ...appPaths, ...research, '/']);
    for (const r of SEO_ROUTES) expect(served.has(r.path), `${r.path} is in the table but not in the router`).toBe(true);
  });
});

describe('resolveSeo', () => {
  it('returns each public route its own title, description and self-referencing canonical', () => {
    for (const path of ['/', '/about', '/about/docs', '/privacy', '/terms']) {
      const seo = resolveSeo(path, PUBLIC);
      expect(seo.noindex).toBe(false);
      expect(seo.canonicalUrl).toBe(path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`);
    }
    expect(resolveSeo('/about', PUBLIC).title).toBe('About Transit Atlas: frequency maps for planners');
  });

  it('ignores a trailing slash', () => {
    expect(normalizePath('/about/')).toBe('/about');
    expect(resolveSeo('/about/', PUBLIC).canonicalUrl).toBe(`${SITE_URL}/about`);
  });

  it('points the /apps/frequency alias at the home page', () => {
    expect(resolveSeo('/apps/frequency', PUBLIC).canonicalUrl).toBe(`${SITE_URL}/`);
  });

  it('marks beta-only routes noindex in a beta build', () => {
    for (const path of ['/apps/night', '/apps/history', '/research', '/changelog']) {
      const seo = resolveSeo(path, BETA);
      expect(seo.noindex).toBe(true);
      expect(seo.matchedPath).toBe(path);
      expect(seo.title.startsWith('[Beta] ')).toBe(true);
    }
  });

  it('marks every route in a staging build noindex, even the public ones', () => {
    expect(resolveSeo('/about', BETA).noindex).toBe(true);
    expect(resolveSeo('/about', { mode: 'preview', flags: {} }).title.startsWith('[Preview] ')).toBe(true);
  });

  it('treats a route missing from the build as the map, indexable only as the home page', () => {
    for (const path of ['/research', '/changelog', '/apps/night', '/apps/live', '/nope']) {
      const seo = resolveSeo(path, PUBLIC);
      expect(seo.matchedPath).toBe('/');
      expect(seo.canonicalUrl).toBe(`${SITE_URL}/`);
    }
  });

  it('uses the staging origin for canonical when given one', () => {
    expect(resolveSeo('/about', { ...BETA, origin: 'https://beta.example.test/' }).canonicalUrl)
      .toBe('https://beta.example.test/about');
  });
});

describe('head tag rewriting', () => {
  const html = readFileSync('index.html', 'utf8');

  it('replaces the page head tags with the route ones and keeps the rest', () => {
    const out = applySeoToHtml(html, resolveSeo('/about', PUBLIC));
    expect(out).toContain('<title>About Transit Atlas: frequency maps for planners</title>');
    expect(out).toContain(`<link rel="canonical" href="${SITE_URL}/about" />`);
    expect(out).toContain(`<meta property="og:url" content="${SITE_URL}/about" />`);
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/rel="canonical"/g)).toHaveLength(1);
    expect(out.match(/name="description"/g)).toHaveLength(1);
    expect(out).not.toContain('name="robots"');
    expect(out).toContain('og:image');
    expect(out).toContain('<div id="root"></div>');
  });

  it('adds noindex for staging builds', () => {
    expect(applySeoToHtml(html, resolveSeo('/apps/night', BETA))).toContain('<meta name="robots" content="noindex" />');
  });

  it('fills the root and refuses a page without an empty root', () => {
    expect(injectRootHtml(html, '<p>hi</p>')).toContain('<div id="root"><p>hi</p></div>');
    expect(() => injectRootHtml('<html></html>', 'x')).toThrow();
  });

  it('prerenders only pages that exist in the build', () => {
    expect(prerenderRoutes({}).map(r => r.path)).toEqual(['/about', '/about/docs', '/privacy', '/terms']);
    expect(prerenderRoutes({ researchApps: true }).map(r => r.path)).toContain('/research');
  });
});

describe('index.html defaults', () => {
  it('match the home route, so a visitor without JavaScript sees the same tags', () => {
    const html = readFileSync('index.html', 'utf8');
    const home = resolveSeo('/', PUBLIC);
    expect(html).toContain(`<title>${home.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${home.canonicalUrl}" />`);
    expect(html.replace(/\s+/g, ' ')).toContain(`name="description" content="${home.description}"`);
  });

  it('carries WebSite and Organization structured data with the real site address', () => {
    const html = readFileSync('index.html', 'utf8');
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    const types = json['@graph'].map((n: { '@type': string }) => n['@type']);
    expect(types).toEqual(['WebSite', 'Organization']);
    for (const n of json['@graph']) expect(n.url).toBe(`${SITE_URL}/`);
  });
});
