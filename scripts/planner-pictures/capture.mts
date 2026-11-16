// For Transit Planners card pictures (CIV-1701): a faded real map plus the card's own app control, trimmed to a couple
// of short rows. Every picture is 4:3, one size for desktop (443x332) and one for phones (306x230), light and dark.
//
// Usage: run a dev server in public mode, then
//   CHROME_PATH=<optional browser> ATLAS_URL=http://localhost:5300 CARTO_BASEMAP_API_KEY=... npx tsx scripts/planner-pictures/capture.mts <work-dir>
// CHROME_PATH points at a Playwright browser when the installed one doesn't match. ONLY=panels or ONLY=compose reruns
// just that step from the captures already in <work-dir>.
// Writes the raw captures to <work-dir> and the finished webp files to public/assets/planners/ (needs cwebp).
import { chromium, type Browser, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleCartoTiles } from '../../local-api/carto-tiles';

const BASE = process.env.ATLAS_URL ?? 'http://localhost:5300';
const WORK = resolve(process.argv[2] ?? 'tmp-planner-pictures');
const ASSETS = resolve('public/assets/planners');
mkdirSync(WORK, { recursive: true });

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const SIZES = { desktop: { w: 443, h: 332, zoom: 0 }, phone: { w: 306, h: 230, zoom: -0.5 } };
type Size = keyof typeof SIZES;

const b: Browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });

async function settle(p: Page, inflight: () => number, hold = 1500) {
  let quiet = 0; const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ok = await p.evaluate(() => { const m = (window as any).__map; return !!(m && m.loaded() && m.areTilesLoaded()) && !document.body.innerText.includes('Loading'); });
    if (ok && inflight() === 0) { if (!quiet) quiet = Date.now(); if (Date.now() - quiet > hold) return; } else quiet = 0;
    await p.waitForTimeout(250);
  }
  console.warn('settle timeout');
}

/** Opens the map. Basemap tiles are served without place names, so no name is cut off at a picture's edge. */
async function openMap(url: string, o: { w: number; h: number; theme: Theme; dpr?: number }) {
  const ctx = await b.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.dpr ?? 2, colorScheme: o.theme });
  await ctx.addInitScript((t: string) => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, o.theme);
  const p = await ctx.newPage();
  let inflight = 0;
  const counted = (r: { url(): string }) => !/\/node_modules\/|\/@fs\/|\/@vite\/|\.pmtiles/.test(r.url());
  p.on('request', r => { if (counted(r)) inflight++; });
  const done = (r: { url(): string }) => { if (counted(r)) inflight = Math.max(0, inflight - 1); };
  p.on('requestfinished', done); p.on('requestfailed', done);
  await p.route('**/api/carto-tiles**', async route => {
    const u = new URL(route.request().url());
    u.searchParams.set('style', (u.searchParams.get('style') ?? 'light_all').replace(/_all$/, '_nolabels'));
    const res = await handleCartoTiles(new Request(u.toString()));
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await p.goto(url);
  await p.waitForFunction(() => Boolean((window as any).__map), null, { timeout: 60000 });
  await settle(p, () => inflight);
  return { ctx, p, settle: (hold = 1500) => settle(p, () => inflight, hold) };
}

const q = (o: Record<string, string | number>) => `${BASE}/?${new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]))}`;
const hideUi = 'body * { visibility: hidden !important; } .maplibregl-canvas-container, .maplibregl-canvas-container * { visibility: visible !important; } .maplibregl-control-container { display:none !important; }';

/** The map alone: app chrome hidden, basemap faded so the coloured routes lead. */
async function mapShot(name: string, view: Record<string, string | number>, size: Size, theme: Theme, half = false) {
  const s = SIZES[size];
  const w = half ? Math.floor(s.w / 2) : s.w;
  const { p, settle, ctx } = await openMap(q({ ...view, z: Number(view.z) + s.zoom }), { w, h: s.h, theme });
  await p.addStyleTag({ content: hideUi });
  await p.evaluate(() => {
    const m = (window as any).__map;
    for (const id of ['basemap-light', 'basemap-dark']) if (m.getLayer(id)) m.setPaintProperty(id, 'raster-opacity', 0.55);
    m.triggerRepaint();
  });
  await settle(1200);
  await p.screenshot({ path: `${WORK}/${name}-${size}-${theme}.png` });
  await ctx.close();
}

/** A control's open panel, cut from the real app at 3x so it stays sharp at either size. `search` (may be empty) picks the panel with a search box. */
async function panelShot(name: string, view: Record<string, string | number>, button: string, needle: string, theme: Theme, search?: string) {
  const { p, settle, ctx } = await openMap(q(view), { w: 1280, h: 800, theme, dpr: 3 });
  await p.getByRole('button', { name: button }).first().click();
  await settle(800);
  if (search) { await p.getByRole('textbox').last().fill(search); await p.waitForTimeout(600); }
  const box = await p.evaluate(({ needle, withInput }) => {
    const els = ([...document.querySelectorAll('div')] as HTMLElement[]).filter(e => e.innerText?.includes(needle) && e.offsetWidth > 110 && e.offsetHeight > 60 && e.offsetWidth < 400 && (!withInput || Boolean(e.querySelector('input'))));
    els.sort((a, c) => a.offsetWidth * a.offsetHeight - c.offsetWidth * c.offsetHeight);
    const e = els.find(e => getComputedStyle(e).borderRadius !== '0px' && getComputedStyle(e).boxShadow !== 'none') ?? els[0];
    const r = e?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, { needle, withInput: search !== undefined });
  if (!box) throw new Error(`no panel for ${name}`);
  await p.screenshot({ path: `${WORK}/${name}-${theme}.png`, clip: box, omitBackground: true });
  await ctx.close();
  return box;
}

const TOR = { lat: 43.6555, lon: -79.3925, z: 11.7, p: 'midday', day: 'Weekday' };
const TOR_WIDE = { lat: 43.70, lon: -79.40, z: 9.4 };
const MIL = { lat: 37.4135, lon: -121.8935, z: 12.1, p: 'midday', day: 'Weekday', h: 60 };

// ONLY=panels or ONLY=compose reruns just that step from earlier captures in <work-dir>.
const ONLY = process.env.ONLY;
const panels: Record<string, { width: number; height: number }> = ONLY ? JSON.parse(readFileSync(`${WORK}/panels.json`, 'utf8')) : {};
for (const theme of THEMES) {
  if (!ONLY) for (const size of Object.keys(SIZES) as Size[]) {
    await mapShot('tor', { ...TOR, h: 20 }, size, theme);
    await mapShot('mil', MIL, size, theme);
    await mapShot('cmp-a', { ...TOR_WIDE, p: 'midday', day: 'Weekday', h: 10 }, size, theme, true);
    await mapShot('cmp-b', { ...TOR_WIDE, p: 'evening', day: 'Sunday', h: 10 }, size, theme, true);
  }
  if (ONLY === 'compose') continue;
  panels.frequency = await panelShot('panel-frequency', { ...TOR, z: 12.2, h: 20 }, 'Frequency', '≤60 min', theme);
  panels.agencies = await panelShot('panel-agencies', { ...MIL, z: 13.3 }, 'Agencies', 'All agencies (', theme, '');
}
await b.close();
writeFileSync(`${WORK}/panels.json`, JSON.stringify(panels));
console.log('captured', panels);

// Compose each card's picture from the captures with the app's own popup shadow (index.css).
const SHADOW = '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.15)';
const pal = (t: Theme) => t === 'dark' ? { bg: '#0a0a0a', border: 'rgba(255,255,255,0.1)' } : { bg: '#f0f0f0', border: 'rgba(0,0,0,0.1)' };
const f = (n: string) => `file://${WORK}/${n}.png`;
const full = (src: string, css = '') => `<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;${css}">`;
const halves = (a: string, c: string, t: Theme) => `<div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1px 1fr"><img src="${a}" style="width:100%;height:100%;object-fit:cover"><div style="background:${pal(t).border}"></div><img src="${c}" style="width:100%;height:100%;object-fit:cover"></div>`;
/** A control clipped by a box: only its top `show` CSS pixels are seen, the rest runs past the picture's bottom edge. */
const clipped = (src: string, w: number, show: number, css: string) => `<div style="position:absolute;${css};width:${w}px;height:${show}px;overflow:hidden;border-radius:12px 12px 0 0;box-shadow:${SHADOW}"><img src="${src}" style="display:block;width:${w}px"></div>`;
// Controls show a little larger than in the app on desktop, at app size on phones. `show` is how much of each control
// (in app CSS pixels) stays inside the picture: its top rows, with the rest running past the picture's bottom edge.
const scale = (size: Size) => size === 'phone' ? 1 : 1.15;
const SHOW = { frequency: 104, agencies: 121 }; // tier list: ≤10, ≤15, ≤20 min (picked). Agency filter: search, All/None, California, BART.

type Scene = (t: Theme, size: Size, w: number, h: number) => string;
const scenes: Record<string, Scene> = {
  // The frequency tier list's top three tiers with ≤20 min picked, over Toronto showing just those routes, coloured by tier.
  frequency: (t, size, w, h) => {
    const k = scale(size), show = Math.round(SHOW.frequency * k);
    return full(f(`tor-${size}-${t}`)) + clipped(f(`panel-frequency-${t}`), panels.frequency.width * k, show, `right:${size === 'phone' ? 12 : 18}px;top:${h - show}px`);
  },
  // The agency filter's search and first agency, over the Milpitas hub where BART, VTA and other agencies meet.
  agency: (t, size, w, h) => {
    const k = scale(size), show = Math.round(SHOW.agencies * k);
    return full(f(`mil-${size}-${t}`)) + clipped(f(`panel-agencies-${t}`), panels.agencies.width * k, show, `right:${size === 'phone' ? 12 : 18}px;top:${h - show}px`);
  },
  // Compare's two maps (weekday midday, Sunday evening, every 10 min) and the TTC 504 card's name and hourly chart.
  dayweek: (t, size, w, h) => {
    const cw = size === 'phone' ? 196 : 240, ch = Math.round(cw * 0.47); // the card's name and hourly chart, not its legend
    return halves(f(`cmp-a-${size}-${t}`), f(`cmp-b-${size}-${t}`), t) + `<div style="position:absolute;left:50%;top:${h - ch - 14}px;transform:translateX(-50%);width:${cw}px;height:${ch}px;overflow:hidden;border-radius:12px;box-shadow:${SHADOW};border:1px solid ${pal(t).border}"><img src="file://${ASSETS}/routecard-${t}.webp" style="width:${cw}px;display:block"></div>`;
  },
  // The exported image (light in either theme) near full size, so its title lines read: its top-left corner, with the
  // rest of its map and its source lines past the picture's edges.
  export: (t, size) => {
    const ew = size === 'phone' ? 700 : 860;
    return full(f(`tor-${size}-${t}`), 'opacity:.5') + `<img src="file://${ASSETS}/export.webp" style="position:absolute;left:${size === 'phone' ? 16 : 24}px;top:${size === 'phone' ? 22 : 30}px;width:${ew}px;border-radius:10px 0 0 0;box-shadow:${SHADOW}">`;
  },
};

const b2 = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
for (const size of Object.keys(SIZES) as Size[]) {
  const { w, h } = SIZES[size];
  const ctx = await b2.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: size === 'phone' ? 3 : 2 });
  const p = await ctx.newPage();
  for (const [name, scene] of Object.entries(scenes)) for (const t of THEMES) {
    const html = `${WORK}/scene.html`;
    writeFileSync(html, `<html><body style="margin:0;background:${pal(t).bg}"><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${scene(t, size, w, h)}</div></body></html>`);
    await p.goto(`file://${html}`); await p.waitForLoadState('load'); await p.waitForTimeout(150);
    const png = `${WORK}/card-${name}-${size}-${t}.png`;
    await p.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '85', png, '-o', `${ASSETS}/card-${name}-${size}-${t}.webp`]);
  }
  await ctx.close();
}
await b2.close();
console.log('ok');
