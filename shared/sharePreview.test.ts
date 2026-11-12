import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { SHARE_CITIES } from './shareCities';
import {
  DEFAULT_SHARE_IMAGE,
  NEAREST_CITY_MAX_KM,
  areaShareImageSeo,
  shareCityForPoint,
  shareCityForQuery,
  shareImageForCity,
  sharePreviewHtml,
} from './sharePreview';
import { SITE_URL, renderSeoTags, resolveSeo } from './seo';

type Rewrite = { source: string; destination: string; has?: Array<{ type: string; key: string; value?: string }> };
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Rewrite[] };

function jpegSize(file: string): { width: number; height: number } | null {
  const b = readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

describe('pictured cities', () => {
  const areas = new Map(
    readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => JSON.parse(readFileSync(join('config/areas', f), 'utf8')) as { slug: string; name: string; page: boolean; center: [number, number] })
      .map(a => [a.slug, a]),
  );
  const index = JSON.parse(readFileSync('shared/data/area-index.json', 'utf8')) as Record<string, { bbox: number[] }>;

  it('are area-page cities, with the name and bounds config/areas has, and a downtown inside their own area', () => {
    for (const city of SHARE_CITIES) {
      const area = areas.get(city.slug);
      expect(area?.page, city.slug).toBe(true);
      expect(city.name, city.slug).toBe(area!.name);
      expect(city.bbox, city.slug).toEqual(index[city.slug].bbox);
      expect(city.rings.length, city.slug).toBeGreaterThan(0);
      expect(shareCityForPoint(city.center[0], city.center[1])?.slug, city.slug).toBe(city.slug);
    }
  });

  it('each have a 1200×630 JPEG picture, small enough for every preview bot', () => {
    for (const city of SHARE_CITIES) {
      const file = join('public', shareImageForCity(city).path);
      expect(existsSync(file), file).toBe(true);
      expect(jpegSize(file), file).toEqual({ width: 1200, height: 630 });
      expect(statSync(file).size, file).toBeLessThan(300_000);
    }
  });

  it('the default picture exists and is the one index.html shares', () => {
    const file = join('public', DEFAULT_SHARE_IMAGE.path);
    expect(jpegSize(file)).toEqual({ width: 1200, height: 630 });
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}${DEFAULT_SHARE_IMAGE.path}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${SITE_URL}${DEFAULT_SHARE_IMAGE.path}" />`);
  });
});

describe('shareCityForPoint', () => {
  it('picks the city whose area holds the point', () => {
    expect(shareCityForPoint(43.6532, -79.3832)?.slug).toBe('toronto');
    expect(shareCityForPoint(41.8781, -87.6298)?.slug).toBe('chicago');
    expect(shareCityForPoint(49.2827, -123.1207)?.slug).toBe('vancouver');
  });

  it("goes by the area's real boundary, not its bounding box", () => {
    // San José and Palo Alto sit inside the San Francisco area's bounding box, but in the San Jose area.
    expect(shareCityForPoint(37.3382, -121.8863)?.slug).toBe('san-jose');
    expect(shareCityForPoint(37.4419, -122.143)?.slug).toBe('san-jose');
    expect(shareCityForPoint(37.8044, -122.2712)?.slug).toBe('san-francisco');
    expect(shareCityForPoint(43.2557, -79.8711)?.slug).toBe('toronto'); // Hamilton, folded into Toronto
    expect(shareCityForPoint(40.7357, -74.1724)?.slug).toBe('new-york'); // Newark
    expect(shareCityForPoint(43.4643, -80.5204)?.slug).toBe('kitchener'); // Waterloo, not Toronto
  });

  it('falls back to the closest center within the limit, and to nothing beyond it', () => {
    // St. Catharines has no area page; downtown Toronto is about 50 km away.
    expect(shareCityForPoint(43.1594, -79.2469)?.slug).toBe('toronto');
    const toronto = SHARE_CITIES.find(c => c.slug === 'toronto')!;
    expect(shareCityForPoint(toronto.center[0] + (NEAREST_CITY_MAX_KM + 5) / 111, toronto.center[1] - 3, [toronto])).toBeNull();
    // Mid-Atlantic and the Nevada desert: no city, so the default picture.
    expect(shareCityForPoint(30, -40)).toBeNull();
    expect(shareCityForPoint(38.5, -116.5)).toBeNull();
  });

  it('ignores coordinates that are not a place', () => {
    expect(shareCityForPoint(Number.NaN, -79)).toBeNull();
    expect(shareCityForPoint(143, -79)).toBeNull();
  });
});

describe('shareCityForQuery', () => {
  it('uses ?area= first, then ?lat=&lon=', () => {
    expect(shareCityForQuery(new URLSearchParams('area=chicago&lat=43.65&lon=-79.38'))?.slug).toBe('chicago');
    expect(shareCityForQuery(new URLSearchParams('area=not-a-city&lat=43.65&lon=-79.38'))?.slug).toBe('toronto');
    expect(shareCityForQuery(new URLSearchParams('lat=43.65'))).toBeNull();
    expect(shareCityForQuery(new URLSearchParams('lat=&lon='))).toBeNull();
    expect(shareCityForQuery(new URLSearchParams('lat=abc&lon=-79'))).toBeNull();
  });
});

describe('sharePreviewHtml', () => {
  it("shows the city's picture and links back to the same spot", () => {
    const html = sharePreviewHtml({ search: '?lat=41.88&lon=-87.63&z=12&route=a"b', mode: 'public' });
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/assets/share/chicago.jpg" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${SITE_URL}/assets/share/chicago.jpg" />`);
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg" />');
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/?lat=41.88&amp;lon=-87.63&amp;z=12&amp;route=a%22b" />`);
    expect(html).toContain(`<title>${resolveSeo('/', { mode: 'public', flags: {} }).title}</title>`);
    expect(html).not.toContain('"b"');
  });

  it('falls back to the default picture away from every city', () => {
    const html = sharePreviewHtml({ search: '?lat=30&lon=-40', mode: 'public' });
    expect(html).toContain(`${SITE_URL}${DEFAULT_SHARE_IMAGE.path}`);
  });

  it('tags staging builds, like their pages', () => {
    expect(sharePreviewHtml({ search: '?lat=41.88&lon=-87.63', mode: 'beta' })).toContain('<title>[Beta] ');
  });
});

describe('area and agency page pictures', () => {
  it("give a pictured area its city's picture, as a JPEG", () => {
    const seo = { ...resolveSeo('/', { mode: 'public', flags: {} }), ...areaShareImageSeo('chicago') };
    expect(seo.image?.url).toBe(`${SITE_URL}/assets/share/chicago.jpg`);
    const tags = renderSeoTags(seo);
    expect(tags).toContain('<meta property="og:image:type" content="image/jpeg" />');
  });

  it('leave other pages on the default picture', () => {
    expect(areaShareImageSeo('not-a-city')).toEqual({});
    expect(areaShareImageSeo(undefined)).toEqual({});
  });
});

describe('vercel.json preview-bot rewrite', () => {
  const homeIndex = vercel.rewrites.findIndex(r => r.source === '/' && !r.has);
  const botRules = vercel.rewrites.filter(r => r.destination === '/api/share-preview');

  it('sends only preview bots, and only for links with a place, to the function, ahead of the static page', () => {
    expect(botRules.map(r => r.has?.find(h => h.type === 'query')?.key).sort()).toEqual(['area', 'lat']);
    for (const rule of botRules) {
      expect(rule.source).toBe('/');
      expect(vercel.rewrites.indexOf(rule)).toBeLessThan(homeIndex);
      expect(rule.has?.some(h => h.type === 'header' && h.key === 'user-agent')).toBe(true);
    }
    expect(existsSync('api/share-preview.ts')).toBe(true);
  });

  it('has no file at "/" on Vercel to win over it: every app route goes to the moved shell, /app.html (CIV-1175)', () => {
    expect(vercel.rewrites.filter(r => r.destination === '/index.html')).toEqual([]);
    expect(vercel.rewrites[homeIndex].destination).toBe('/app.html');
    expect(vercel.rewrites.find(r => r.source === '/index.html')?.destination).toBe('/app.html');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.build.trim().endsWith('node scripts/vercel-root-shell.mjs')).toBe(true);
    expect(readFileSync('scripts/vercel-root-shell.mjs', 'utf8')).toContain("export const ROOT_SHELL = 'app.html'");
    expect(readFileSync('.vercelignore', 'utf8')).toContain('!scripts/vercel-root-shell.mjs');
  });

  it('matches preview bots, never people or search engines', () => {
    for (const rule of botRules) {
      const value = rule.has!.find(h => h.type === 'header')!.value!;
      const re = new RegExp(value.replace(/^\(\?i\)/, ''), 'i');
      for (const bot of [
        'Twitterbot/1.0',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
        'WhatsApp/2.23.20.0',
        'TelegramBot (like TwitterBot)',
        'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)',
      ]) expect(re.test(bot), bot).toBe(true);
      for (const person of [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      ]) expect(re.test(person), person).toBe(false);
    }
  });
});
