/**
 * Link-preview pictures of the frequency map, one per city in shared/shareCities.ts (CIV-1175): 1200×630 JPEGs in public/assets/share/<slug>.jpg,
 * in the style of public/assets/atlas-share-map-toronto.jpg. The real Atlas map (public catalog), weekday AM peak, routes
 * every 60 min or better, on CARTO's basemap without place names, no app UI, only the basemap credit the licence requires.
 *
 *   npx tsx scripts/build-share-maps.ts                 # every city in SHARE_CITIES
 *   npx tsx scripts/build-share-maps.ts toronto chicago # only these
 *   options: --url http://localhost:5183 (an already-running `vite` dev server), --report <path> (default: the OS temp
 *   folder), --quality 80, --scale 2 and --zoom 10.7 (device px per CSS px and base zoom; see SCALE and REF_ZOOM)
 *
 * Needs the Vite dev server, not `vite preview`: the map instance is exposed as window.__map only in dev builds. If
 * nothing answers on the port the script starts one itself (public mode) and stops it at the end. Basemap tiles are
 * fetched through local-api/carto-tiles.ts with CARTO_BASEMAP_API_KEY from .env.local (localhost is not on the public
 * key's host list), and the tile request is switched to the `_nolabels` style there, so no labelled tile can load.
 *
 * Framing: each picture is centred on the main city's downtown (`center` in shared/shareCities.ts; config/areas centers
 * are the metro's geographic middle, often far from the city). Zoom is the reference picture's (10.7 at 2× scale), or closer, up
 * to 0.8 more, when the drawn network around that center is small enough to fit. FRAME_OVERRIDES pins a view by hand.
 * Read-only: data comes from the public R2 bucket through the dev server's proxy; nothing is written outside public/.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { config } from 'dotenv';
import { handleCartoTiles } from '../local-api/carto-tiles';
import { SHARE_CITIES } from '../shared/shareCities';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(ROOT, '.env.local'), quiet: true } as Parameters<typeof config>[0]);

/** Output size in pixels. The page is laid out at WIDTH / SCALE CSS px and rendered at SCALE device px per CSS px,
 *  which gives the reference picture's thicker route lines and plainer basemap. */
const WIDTH = 1200;
const HEIGHT = 630;
let SCALE = 2;
const cssW = () => WIDTH / SCALE;
const cssH = () => HEIGHT / SCALE;
/** The reference picture's zoom; big networks are shown at this zoom, small ones closer. */
/** Base zoom, in CSS px terms. At SCALE 2 this covers the same ground across 1200 px as zoom 11.7 at scale 1, matching
 *  atlas-share-map-toronto.jpg (calibrated by eye on landmark distances, 2026-11-11). */
let REF_ZOOM = 10.7;
/** Small networks are shown up to this much closer than the base zoom, never further out. */
const MAX_ZOOM_IN = 0.8;
const VIEW_PARAMS = { p: 'amPeak', day: 'Weekday', h: '60', span: '1', limited: '1' };
/** Hand-picked views, for a city whose computed view looks wrong. */
const FRAME_OVERRIDES: Record<string, { lat: number; lon: number; z: number }> = {};
/** Drawn route layers (the hit layers are invisible click targets). */
const ROUTE_LAYERS = ['overview-routes-layer', 'routes-layer', 'local-routes-layer', 'frequency-qualifying-segments-layer'];

const hideUiCss = () => `
  body * { visibility: hidden !important; }
  .maplibregl-canvas-container, .maplibregl-canvas-container * { visibility: visible !important; }
  .maplibregl-control-container { display: none !important; }
  #share-credit { visibility: visible !important; position: fixed; right: 8px; bottom: 8px; z-index: 2147483647;
    font: 500 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #5f6368;
    background: rgba(255,255,255,0.88); padding: 5px 8px; border-radius: 999px; letter-spacing: 0.01em;
    zoom: ${1 / SCALE}; } /* the same size in the picture at any SCALE */
`;

interface Args { slugs: string[]; url: string; report: string; quality: number; scale?: number; zoom?: number }
function parseArgs(argv: string[]): Args {
  const out: Args = {
    slugs: [], url: 'http://localhost:5183', quality: 80,
    report: resolve(tmpdir(), 'share-maps-report.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--report') out.report = resolve(argv[++i]);
    else if (a === '--quality') out.quality = Number(argv[++i]);
    else if (a === '--scale') out.scale = Number(argv[++i]);
    else if (a === '--zoom') out.zoom = Number(argv[++i]);
    else out.slugs.push(a);
  }
  return out;
}

type Bbox = [number, number, number, number];

async function serverUp(url: string): Promise<boolean> {
  try { return (await fetch(url)).ok; } catch { return false; }
}

async function ensureServer(url: string): Promise<ChildProcess | null> {
  if (await serverUp(url)) return null;
  const port = new URL(url).port || '5183';
  const child = spawn('npx', ['vite', '--port', port, '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', detached: false,
    env: {
      ...process.env, VITE_ATLAS_MODE: 'public', VITE_LIVE_ENABLED: 'false', VITE_HISTORY_ENABLED: 'false',
      VITE_CARD_CLICK_TO_FLAG_ENABLED: 'false', VITE_UNEVEN_BANNER_ENABLED: 'false',
    },
  });
  for (let i = 0; i < 60; i++) {
    if (await serverUp(url)) return child;
    await new Promise(r => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error(`Vite dev server did not start on ${url}`);
}

async function launch(): Promise<Browser> {
  try { return await chromium.launch({ headless: true }); }
  catch { return chromium.launch({ headless: true, channel: 'chrome' }); }
}

function mapUrl(base: string, view: { lat: number; lon: number; z: number }): string {
  const q = new URLSearchParams({ lat: view.lat.toFixed(5), lon: view.lon.toFixed(5), z: view.z.toFixed(2), ...VIEW_PARAMS });
  return `${base}/?${q}`;
}

/** A fresh page: light theme, no saved state, basemap tiles served without labels, in-flight requests counted. */
async function openPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: cssW(), height: cssH() }, deviceScaleFactor: SCALE, colorScheme: 'light' });
  const page = await ctx.newPage();
  const state = { inFlight: 0, badTiles: 0 };
  // Module files (the MapLibre worker script never reports finished) don't count; data and tile requests do.
  const counted = (r: { url(): string }) => !/\/node_modules\/|\/@fs\/|\/@vite\//.test(r.url());
  page.on('request', r => { if (counted(r)) state.inFlight++; });
  const done = (r: { url(): string }) => { if (counted(r)) state.inFlight = Math.max(0, state.inFlight - 1); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  await page.route('**/api/carto-tiles**', async route => {
    const u = new URL(route.request().url());
    u.searchParams.set('style', (u.searchParams.get('style') ?? 'light_all').replace(/_all$/, '_nolabels'));
    const res = await handleCartoTiles(new Request(u.toString()));
    // The handler marks CARTO's "API key required" watermark tile (and any error) as no-store.
    if (res.status !== 200 || /no-store/.test(res.headers.get('cache-control') ?? '')) state.badTiles++;
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  return { ctx, page, state };
}

/** Wait until no request is in flight and the map reports every tile loaded, held for `hold` ms. */
async function waitSettled(page: Page, state: { inFlight: number }, hold = 1500, timeout = 90000): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__map), null, { timeout });
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      const m = (window as any).__map;
      return Boolean(m && m.loaded() && m.areTilesLoaded());
    });
    if (ready && state.inFlight === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= hold) return;
    } else quietSince = 0;
    await page.waitForTimeout(250);
  }
  throw new Error('map did not settle');
}

async function renderedRouteCount(page: Page): Promise<number> {
  return page.evaluate(layers => {
    const m = (window as any).__map;
    const present = layers.filter((id: string) => m.getLayer(id));
    return m.queryRenderedFeatures({ layers: present }).length;
  }, ROUTE_LAYERS);
}

// Web Mercator in pixels at zoom z (512-px tiles, as MapLibre).
const worldX = (lon: number, z: number) => ((lon + 180) / 360) * 512 * 2 ** z;
const worldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 * 2 ** z;
};
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/**
 * The view for a city: its downtown center, at the reference zoom, or closer (up to MAX_ZOOM_IN more) when 90% of the drawn
 * network inside the area's bounds fits a window around that center.
 */
async function chooseFrame(browser: Browser, base: string, center: [number, number], bbox: Bbox): Promise<{ lat: number; lon: number; z: number }> {
  const [s, w, n, e] = bbox;
  const { ctx, page, state } = await openPage(browser);
  try {
    await page.goto(mapUrl(base, { lat: center[0], lon: center[1], z: 9 }));
    await waitSettled(page, state, 1000);
    await page.evaluate(b => (window as any).__map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { animate: false, padding: 0 }), bbox);
    await page.waitForTimeout(500);
    await waitSettled(page, state, 1500);
    const lines: number[][][] = await page.evaluate(layers => {
      const m = (window as any).__map;
      const present = layers.filter((id: string) => m.getLayer(id));
      const out: number[][][] = [];
      for (const f of m.queryRenderedFeatures({ layers: present })) {
        const g = f.geometry;
        if (g.type === 'LineString') out.push(g.coordinates);
        else if (g.type === 'MultiLineString') out.push(...g.coordinates);
      }
      return out;
    }, ROUTE_LAYERS);
    const view = { lat: center[0], lon: center[1], z: REF_ZOOM };
    if (lines.length === 0) return view; // the capture step flags it (noRoutes)

    // Route length sampled every ~20 CSS px at the base zoom, as distances from the center.
    const cx = worldX(center[1], REF_ZOOM);
    const cy = worldY(center[0], REF_ZOOM);
    const dx: number[] = [];
    const dy: number[] = [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const [lon0, lat0] = line[i - 1];
        const [lon1, lat1] = line[i];
        if (lat0 < s || lat0 > n || lon0 < w || lon0 > e) continue;
        const [x0, y0] = [worldX(lon0, REF_ZOOM), worldY(lat0, REF_ZOOM)];
        const [x1, y1] = [worldX(lon1, REF_ZOOM), worldY(lat1, REF_ZOOM)];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 20));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          dx.push(Math.abs(x0 + (x1 - x0) * t - cx));
          dy.push(Math.abs(y0 + (y1 - y0) * t - cy));
        }
      }
    }
    if (dx.length === 0) return view;
    const halfW = Math.max(1, pct(dx.sort((a, b) => a - b), 0.9));
    const halfH = Math.max(1, pct(dy.sort((a, b) => a - b), 0.9));
    const fitZ = REF_ZOOM + Math.log2(Math.min(cssW() / 2 / halfW, cssH() / 2 / halfH));
    view.z = Math.round(Math.min(REF_ZOOM + MAX_ZOOM_IN, Math.max(REF_ZOOM, fitZ)) * 100) / 100;
    return view;
  } finally {
    await ctx.close();
  }
}

/** Share of pixels that are clearly coloured (HSV saturation > 0.3): the basemap is near grey, routes are not. */
async function routePixelShare(page: Page, jpeg: Buffer): Promise<number> {
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let coloured = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      if (max > 0 && (max - min) / max > 0.3) coloured++;
    }
    return coloured / (c.width * c.height);
  }, jpeg.toString('base64'));
}

async function capture(browser: Browser, base: string, slug: string, view: { lat: number; lon: number; z: number }, quality: number, out: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { ctx, page, state } = await openPage(browser);
    try {
      await page.goto(mapUrl(base, view));
      await waitSettled(page, state, attempt === 1 ? 1500 : 4000);
      const routes = await renderedRouteCount(page);
      if (routes === 0 && attempt === 1) continue;
      await page.addStyleTag({ content: hideUiCss() });
      await page.evaluate(() => {
        const el = document.createElement('div');
        el.id = 'share-credit';
        el.textContent = '© OpenStreetMap © CARTO';
        document.body.appendChild(el);
      });
      const canvas = await page.evaluate(() => {
        const c = (window as any).__map.getCanvas() as HTMLCanvasElement;
        return { w: c.clientWidth, h: c.clientHeight };
      });
      if (canvas.w !== cssW() || canvas.h !== cssH()) throw new Error(`map canvas is ${canvas.w}×${canvas.h}`);
      await page.waitForTimeout(600); // raster fade-in
      const jpeg = await page.screenshot({ type: 'jpeg', quality });
      writeFileSync(out, jpeg);
      const colouredShare = await routePixelShare(page, jpeg);
      // Saved either way, but a picture with no drawn route is flagged: a stalled load or no qualifying service there.
      return { routes, badTiles: state.badTiles, colouredShare, url: page.url(), ...(routes === 0 ? { noRoutes: true } : {}) };
    } finally {
      await ctx.close();
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.scale) SCALE = args.scale;
  if (args.zoom) REF_ZOOM = args.zoom;
  const unknown = args.slugs.filter(s => !SHARE_CITIES.some(c => c.slug === s));
  if (unknown.length) throw new Error(`not in SHARE_CITIES: ${unknown.join(', ')}`);
  const todo = args.slugs.length ? SHARE_CITIES.filter(c => args.slugs.includes(c.slug)) : SHARE_CITIES;
  const outDir = resolve(ROOT, 'public/assets/share');
  mkdirSync(outDir, { recursive: true });

  const server = await ensureServer(args.url);
  const browser = await launch();
  const report: Record<string, unknown> = {};
  let total = 0;
  try {
    for (const { slug, center, bbox } of todo) {
      const out = resolve(outDir, `${slug}.jpg`);
      try {
        const view = FRAME_OVERRIDES[slug] ?? await chooseFrame(browser, args.url, center, bbox);
        const r = await capture(browser, args.url, slug, view, args.quality, out);
        const bytes = statSync(out).size;
        total += bytes;
        report[slug] = { bytes, colouredShare: Number(r.colouredShare.toFixed(4)), routeFeatures: r.routes, badTiles: r.badTiles, view, url: r.url.replace(args.url, ''), ...('noRoutes' in r ? { noRoutes: true } : {}) };
        const flag = 'noRoutes' in r ? '  NO ROUTES DRAWN' : r.badTiles ? `  ${r.badTiles} bad basemap tiles` : '';
        console.log(`${slug.padEnd(28)} ${(bytes / 1024).toFixed(0).padStart(4)} KB  coloured ${(r.colouredShare * 100).toFixed(1).padStart(5)}%  z${view.z}${flag}`);
      } catch (err) {
        report[slug] = { failed: String((err as Error).message ?? err) };
        console.log(`${slug.padEnd(28)} FAILED: ${(err as Error).message}`);
      }
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  mkdirSync(dirname(args.report), { recursive: true });
  // Merge into an existing report so a partial re-run keeps the other cities.
  let prev: Record<string, unknown> = {};
  try { prev = JSON.parse(readFileSync(args.report, 'utf8')); } catch { /* first run */ }
  writeFileSync(args.report, `${JSON.stringify({ ...prev, ...report }, null, 2)}\n`);
  console.log(`${todo.length} pictures, ${(total / 1024).toFixed(0)} KB this run; report: ${args.report}`);
}

main().catch(err => { console.error(err); process.exit(1); });
