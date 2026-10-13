import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENCY_ROUTE_SOURCES, AREA_ROUTE_SOURCES, SEO_ROUTES, SITE_URL, buildSitemapXml, knownRouteSources, sitemapRoutes } from './seo';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: { source: string; destination: string }[] };

describe('sitemap.xml', () => {
  it('is not stale: matches what the generator writes (run `npm run build:sitemap`)', () => {
    expect(readFileSync('public/sitemap.xml', 'utf8')).toBe(buildSitemapXml());
  });

  it('lists only public, indexable, canonical pages', () => {
    const xml = readFileSync('public/sitemap.xml', 'utf8');
    for (const r of SEO_ROUTES) {
      const listed = xml.includes(`<loc>${SITE_URL}${r.path}</loc>`) || (r.path === '/' && xml.includes(`<loc>${SITE_URL}/</loc>`));
      expect(listed, r.path).toBe(r.indexable && !r.canonicalPath);
    }
    expect(sitemapRoutes().every(r => !r.gate)).toBe(true);
  });
});

describe('robots.txt', () => {
  it('allows crawling and points at the sitemap', () => {
    const robots = readFileSync('public/robots.txt', 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

describe('vercel.json routing', () => {
  const sources = vercel.rewrites.map(r => r.source);

  it('sends every known app route to the app, and nothing broader', () => {
    for (const route of knownRouteSources()) expect(sources, route).toContain(route);
    // No catch-all: an unknown path must fall through to a real 404.
    for (const s of sources) {
      const patterned = s.includes('(') || s.includes('*') || s.includes(':');
      expect(patterned, `${s} is a pattern`).toBe(s.startsWith('/beta-data/') || AGENCY_ROUTE_SOURCES.includes(s) || AREA_ROUTE_SOURCES.includes(s));
    }
  });

  it('serves each agency page from its own prerendered file, so public builds (no files) return 404', () => {
    for (const source of AGENCY_ROUTE_SOURCES) {
      expect(vercel.rewrites.find(r => r.source === source)?.destination).toBe('/agency/:slug/index.html');
    }
    for (const source of AREA_ROUTE_SOURCES) {
      expect(vercel.rewrites.find(r => r.source === source)?.destination).toBe('/area/:slug/index.html');
    }
  });

  it('serves the agency index from its own prerendered file', () => {
    for (const source of ['/agencies', '/agencies/']) {
      expect(vercel.rewrites.find(r => r.source === source)?.destination).toBe('/agencies/index.html');
    }
  });

  it('serves the prerendered pages from their own file', () => {
    for (const path of ['/about', '/about/docs', '/privacy', '/terms']) {
      expect(vercel.rewrites.find(r => r.source === path)?.destination).toBe(`${path}/index.html`);
    }
  });

  it('has a 404 page and keeps robots.txt and sitemap.xml out of the rewrites', () => {
    expect(existsSync('public/404.html')).toBe(true);
    expect(sources).not.toContain('/robots.txt');
    expect(sources).not.toContain('/sitemap.xml');
  });
});
