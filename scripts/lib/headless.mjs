// One headless-browser helper for the scripts that open Atlas in Chromium (CIV-1802): the card and share pictures,
// the overlay and logo checks and the benchmark. Plain JavaScript, so the node (.mjs) scripts and the tsx (.ts/.mts)
// ones both import it. It holds the fixes that used to live in one script only: the browser to use, counting
// requests still in flight, basemap tiles served without place names, and waiting for the map to finish drawing.
import { access } from 'node:fs/promises';
import { chromium } from 'playwright';

/**
 * Launches Chromium. `executablePath` wins, then CHROME_PATH or PW_CHROMIUM (a local Chromium in place of
 * Playwright's own download). With none of them, Playwright's browser is tried first and the installed Chrome after.
 * @param {{ headless?: boolean, executablePath?: string }} [o]
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser(o = {}) {
  const headless = o.headless ?? true;
  const executablePath = o.executablePath ?? process.env.CHROME_PATH ?? process.env.PW_CHROMIUM;
  if (executablePath) return chromium.launch({ headless, executablePath });
  try { return await chromium.launch({ headless }); }
  catch { return chromium.launch({ headless, channel: 'chrome' }); }
}

/**
 * The first installed Chrome found (for a run that should measure the real browser), or undefined.
 * @param {Array<string | undefined>} [first] paths to try before the usual install places
 */
export async function findSystemChrome(first = []) {
  const candidates = [
    ...first,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  return undefined;
}

/**
 * A fresh page in its own context: its size, pixel ratio and theme (the browser's colour scheme, and with `saveTheme`
 * the site's saved theme: true for the same, or 'light' / 'dark' to differ from the browser's), with the
 * requests still in flight counted in `state.inFlight` (module files don't count: the MapLibre worker never reports
 * finished). `cartoTiles`, local-api/carto-tiles.ts's handler, serves basemap tiles without place names so none is cut
 * off at a picture's edge; a tile that came back as an error or the "API key required" watermark adds to `state.badTiles`.
 * @param {import('playwright').Browser} browser
 * @param {{ width: number, height: number, dpr?: number, theme?: 'light' | 'dark', saveTheme?: boolean | 'light' | 'dark', cartoTiles?: (req: Request) => Promise<Response> }} o
 */
export async function openPage(browser, o) {
  const theme = o.theme ?? 'light';
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: o.dpr ?? 1, colorScheme: theme });
  const saved = o.saveTheme === true ? theme : o.saveTheme || null;
  if (saved) await ctx.addInitScript(t => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, saved);
  const page = await ctx.newPage();
  const state = { inFlight: 0, badTiles: 0 };
  const counted = r => !/\/node_modules\/|\/@fs\/|\/@vite\/|\.pmtiles/.test(r.url());
  page.on('request', r => { if (counted(r)) state.inFlight++; });
  const done = r => { if (counted(r)) state.inFlight = Math.max(0, state.inFlight - 1); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  if (o.cartoTiles) {
    const handler = o.cartoTiles;
    await page.route('**/api/carto-tiles**', async route => {
      const u = new URL(route.request().url());
      u.searchParams.set('style', (u.searchParams.get('style') ?? 'light_all').replace(/_all$/, '_nolabels'));
      const res = await handler(new Request(u.toString()));
      if (res.status !== 200 || /no-store/.test(res.headers.get('cache-control') ?? '')) state.badTiles++;
      await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    });
  }
  return { ctx, page, state };
}

/**
 * Waits until the map (window.__map) has loaded every tile, nothing is in flight and no "Loading" text shows, held
 * for `hold` ms. Past `timeout` it throws, or with `onTimeout: 'warn'` logs and returns.
 * @param {import('playwright').Page} page
 * @param {{ inFlight: number }} state
 * @param {{ hold?: number, timeout?: number, onTimeout?: 'throw' | 'warn', loadingText?: boolean }} [o]
 */
export async function waitForMap(page, state, o = {}) {
  const hold = o.hold ?? 1500;
  const timeout = o.timeout ?? 90000;
  await page.waitForFunction(() => Boolean(window.__map), null, { timeout });
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(checkText => {
      const m = window.__map;
      return Boolean(m && m.loaded() && m.areTilesLoaded()) && !(checkText && document.body.innerText.includes('Loading'));
    }, o.loadingText ?? false);
    if (ready && state.inFlight === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= hold) return;
    } else quietSince = 0;
    await page.waitForTimeout(250);
  }
  if (o.onTimeout === 'warn') { console.warn('map did not settle'); return; }
  throw new Error('map did not settle');
}
