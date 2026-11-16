// For Transit Planners card pictures (CIV-1701): a faded real map plus the card's own app control, trimmed to a couple
// of short rows. Every picture is 4:3, one size for desktop (443x332) and one for phones (306x230), light and dark.
//
// Usage: run a dev server in public mode, then
//   CHROME_PATH=<optional browser> ATLAS_URL=http://localhost:5300 CARTO_BASEMAP_API_KEY=... npx tsx scripts/planner-pictures/capture.mts <work-dir>
// CHROME_PATH points at a Playwright browser when the installed one doesn't match. ONLY=panels or ONLY=compose reruns
// just that step from the captures already in <work-dir>. CARDS=demo,agency remakes only those cards' pictures and leaves the
// rest as they are. The Request a demo card's panel comes from the local Studio page (dev server only): STUDIO_URL points at a
// dev server that has it and tmp/studio/kingston-before-after.json (defaults to ATLAS_URL).
// Writes the raw captures to <work-dir> and the finished webp files to public/assets/planners/ (needs cwebp).
import { chromium, type Browser, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleCartoTiles } from '../../local-api/carto-tiles';

const BASE = process.env.ATLAS_URL ?? 'http://localhost:5300';
const STUDIO_BASE = process.env.STUDIO_URL ?? BASE;
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
async function mapShot(name: string, view: Record<string, string | number>, size: Size, theme: Theme) {
  const s = SIZES[size];
  const { p, settle, ctx } = await openMap(q({ ...view, z: Number(view.z) + s.zoom }), { w: s.w, h: s.h, theme });
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

/** The width every control is shown at, in app CSS pixels: the agency filter's own width, so all pictures match. */
const PANEL_W = 196;

/**
 * A control's open panel, cut from the real app at 3x so it stays sharp at either size. `open` opens it; `needle` is text
 * inside it; `withSearch` picks the whole panel around a search box. Every panel is set to the same width (PANEL_W) before the shot so the pictures line up.
 */
async function panelShot(name: string, view: Record<string, string | number>, open: (p: Page) => Promise<void>, needle: string, theme: Theme, withSearch = false) {
  const { p, settle, ctx } = await openMap(q(view), { w: 1280, h: 800, theme, dpr: 3 });
  await open(p);
  await settle(800);
  const box = await p.evaluate(({ needle, width, withSearch }) => {
    const els = ([...document.querySelectorAll('div')] as HTMLElement[]).filter(e => e.innerText?.includes(needle) && e.offsetWidth > 100 && e.offsetHeight > 50 && e.offsetWidth < 420 && (!withSearch || Boolean(e.querySelector('input'))));
    els.sort((a, c) => a.offsetWidth * a.offsetHeight - c.offsetWidth * c.offsetHeight);
    const e = els.find(e => getComputedStyle(e).borderRadius !== '0px' && getComputedStyle(e).boxShadow !== 'none') ?? els[0];
    if (!e) return null;
    e.style.width = `${width}px`; e.style.minWidth = `${width}px`; e.style.maxWidth = `${width}px`;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { needle, width: PANEL_W, withSearch });
  if (!box) throw new Error(`no panel for ${name}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${WORK}/${name}-${theme}.png`, clip: box, omitBackground: true });
  await ctx.close();
  return box;
}
/**
 * The Request a demo card's control: the local Studio page's changes list for Kingston (CIV-1715), cut like the others at
 * PANEL_W. Studio's map isn't the frequency map, so this waits for the list's text instead of the map.
 */
async function studioPanelShot(name: string, needle: string, theme: Theme) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3, colorScheme: theme });
  await ctx.addInitScript((t: string) => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, theme);
  const p = await ctx.newPage();
  await p.goto(`${STUDIO_BASE}/studio`);
  await p.waitForFunction((n: string) => document.body.innerText.includes(n), needle, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const box = await p.evaluate(({ needle, width }) => {
    const e = ([...document.querySelectorAll('section')] as HTMLElement[]).find(e => e.innerText?.includes(needle));
    if (!e) return null;
    e.style.width = `${width}px`; e.style.minWidth = `${width}px`; e.style.maxWidth = `${width}px`;
    // At PANEL_W a route's name leaves no room for its change ("60 min → 30 min"), so the shot drops the names, and the
    // list's own "Routes" title row, so its top rows are the heading and a changed route.
    (e.firstElementChild as HTMLElement).style.display = 'none';
    for (const btn of e.querySelectorAll<HTMLElement>('li button')) {
      btn.style.gridTemplateColumns = '0.5rem auto minmax(0,1fr)';
      (btn.children[2] as HTMLElement).style.display = 'none';
      (btn.children[3] as HTMLElement).style.justifySelf = 'end';
    }
    const first = e.querySelector<HTMLElement>('h3')?.parentElement;
    if (first) first.style.marginTop = '0';
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { needle, width: PANEL_W });
  if (!box) throw new Error(`no panel for ${name}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${WORK}/${name}-${theme}.png`, clip: box, omitBackground: true });
  await ctx.close();
  return box;
}
const click = (button: string) => async (p: Page) => { await p.getByRole('button', { name: button }).first().click(); };
const rightClick = async (p: Page) => { await p.mouse.click(640, 500, { button: 'right' }); };

// One map treatment for every picture: the same zoom offset, the same faded basemap without place names.
const DAY = { p: 'midday', day: 'Weekday' };
const VIEWS = {
  frequency: { lat: 43.6555, lon: -79.3925, z: 12, ...DAY, h: 15 },  // Toronto, tiers up to every 15 min
  dayweek: { lat: 41.8835, lon: -87.6528, z: 12, ...DAY, h: 60 },    // Chicago, every tier
  agency: { lat: 37.4135, lon: -121.8935, z: 12, ...DAY, h: 60 },    // Milpitas, where BART, VTA and others meet
  export: { lat: 43.6700, lon: -79.4100, z: 12, ...DAY, h: 60 },     // Toronto west of downtown
  demo: { lat: 44.2312, lon: -76.4860, z: 12, ...DAY, h: 60 },       // Kingston, the Studio demo agency (CIV-1680)
};
const CARDS = process.env.CARDS ? process.env.CARDS.split(',') : Object.keys(VIEWS);
const want = (card: string) => CARDS.includes(card);

// ONLY=panels or ONLY=compose reruns just that step from earlier captures in <work-dir>.
const ONLY = process.env.ONLY;
const panels: Record<string, { width: number; height: number }> = ONLY ? JSON.parse(readFileSync(`${WORK}/panels.json`, 'utf8')) : {};
for (const theme of THEMES) {
  if (!ONLY) for (const size of Object.keys(SIZES) as Size[]) for (const [card, view] of Object.entries(VIEWS)) if (want(card)) await mapShot(`map-${card}`, view, size, theme);
  if (ONLY === 'compose') continue;
  if (want('frequency')) panels.frequency = await panelShot('panel-frequency', VIEWS.frequency, click('Frequency'), '≤60 min', theme);
  if (want('dayweek')) panels.dayweek = await panelShot('panel-dayweek', VIEWS.dayweek, click('Time'), 'Overnight', theme);
  if (want('agency')) panels.agency = await panelShot('panel-agency', VIEWS.agency, click('Agencies'), 'All agencies (', theme, true);
  if (want('export')) panels.export = await panelShot('panel-export', VIEWS.export, rightClick, 'Copy URL for here', theme);
  if (want('demo')) panels.demo = await studioPanelShot('panel-demo', 'Frequency or Trips Changed', theme);
}
await b.close();
writeFileSync(`${WORK}/panels.json`, JSON.stringify(panels));
console.log('captured', panels);

// Compose: every picture is its map plus its control in the same place, the bottom-right corner, at the same width and
// scale, with the app's own popup shadow (index.css), its top two rows inside the picture and the rest past the edge.
const SHADOW = '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.15)';
const pal = (t: Theme) => t === 'dark' ? { bg: '#0a0a0a' } : { bg: '#f0f0f0' };
const f = (n: string) => `file://${WORK}/${n}.png`;
const scale = (size: Size) => size === 'phone' ? 1 : 1.15; // a little larger than the app on desktop, app size on phones
const MARGIN = (size: Size) => size === 'phone' ? 12 : 18;
const SHOW = 70; // app CSS pixels of each control inside the picture: its top two rows (the agency filter: search, All/None)
const scene = (card: string, t: Theme, size: Size, h: number) => {
  const k = scale(size), w = PANEL_W * k, show = Math.round(Math.min(SHOW, panels[card].height) * k);
  return `<img src="${f(`map-${card}-${size}-${t}`)}" style="position:absolute;inset:0;width:100%;height:100%">`
    + `<div style="position:absolute;right:${MARGIN(size)}px;top:${h - show}px;width:${w}px;height:${show}px;overflow:hidden;border-radius:12px 12px 0 0;box-shadow:${SHADOW}"><img src="${f(`panel-${card}-${t}`)}" style="display:block;width:${w}px"></div>`;
};

const b2 = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
for (const size of Object.keys(SIZES) as Size[]) {
  const { w, h } = SIZES[size];
  const ctx = await b2.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: size === 'phone' ? 3 : 2 });
  const p = await ctx.newPage();
  for (const name of Object.keys(VIEWS).filter(want)) for (const t of THEMES) {
    const html = `${WORK}/scene.html`;
    writeFileSync(html, `<html><body style="margin:0;background:${pal(t).bg}"><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${scene(name, t, size, h)}</div></body></html>`);
    await p.goto(`file://${html}`); await p.waitForLoadState('load'); await p.waitForTimeout(150);
    const png = `${WORK}/card-${name}-${size}-${t}.png`;
    await p.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '85', png, '-o', `${ASSETS}/card-${name}-${size}-${t}.webp`]);
  }
  await ctx.close();
}
await b2.close();
console.log('ok');
