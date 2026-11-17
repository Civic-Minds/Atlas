// For Transit Planners and For Researchers card pictures (CIV-1794, Ryan's pick B): the real map showing only what makes
// the card's point, every app control hidden, and one small label in the map's own pill style. Every picture is 4:3, one
// size for desktop (443x332) and one for phones (306x230), light and dark.
//
// Usage: run a dev server in public mode (npm run dev:public), then
//   CHROME_PATH=<optional browser> ATLAS_URL=http://localhost:5300 CARTO_BASEMAP_API_KEY=... npx tsx scripts/planner-pictures/capture.mts <work-dir>
// CHROME_PATH points at a Playwright browser when the installed one doesn't match. ONLY=compose reruns just the compose
// step from the captures already in <work-dir>. CARDS=agency,export remakes only those cards' pictures and leaves the rest.
// Writes the raw captures to <work-dir> and the finished webp files to public/assets/planners/ (needs cwebp).
import { launchBrowser, openPage, waitForMap } from '../lib/headless.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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

const b = await launchBrowser();

/**
 * Opens the map: basemap tiles without place names (no name cut off at a picture's edge), waits for it to draw, and
 * hands back a settle for later changes. The browser, request counting and wait are the shared helper (CIV-1802).
 */
async function openMap(url: string, o: { w: number; h: number; theme: Theme; dpr?: number }) {
  const { ctx, page: p, state } = await openPage(b, { width: o.w, height: o.h, dpr: o.dpr ?? 2, theme: o.theme, saveTheme: true, cartoTiles: handleCartoTiles });
  await p.goto(url);
  const settle = (hold = 1500) => waitForMap(p, state, { hold, loadingText: true, onTimeout: 'warn' });
  await settle();
  return { ctx, p, settle };
}

const hideUi = 'body * { visibility: hidden !important; } .maplibregl-canvas-container, .maplibregl-canvas-container * { visibility: visible !important; } .maplibregl-control-container { display:none !important; }';

/**
 * The map alone: app chrome hidden, basemap faded so the coloured routes lead. `path` opens another map app; Compare's
 * split only shows on a desktop-wide page, so it is drawn two or three times larger at a lower pixel ratio (the same pixels).
 */
async function mapShot(name: string, card: Card, size: Size, theme: Theme) {
  const s = SIZES[size];
  const k = card.path ? (size === 'phone' ? 3 : 2) : 1;
  const view = { ...card.view, z: Number(card.view.z) + s.zoom + Math.log2(k) };
  const { p, settle, ctx } = await openMap(`${BASE}${card.path ?? '/'}?${new URLSearchParams(Object.entries(view).map(([key, v]) => [key, String(v)]))}`, { w: s.w * k, h: s.h * k, theme, dpr: 2 / k });
  await p.addStyleTag({ content: hideUi });
  await p.evaluate(() => {
    const maps = [(window as any).__map, (window as any).__mapB].filter(Boolean);
    for (const m of maps) {
      for (const id of ['basemap-light', 'basemap-dark']) if (m.getLayer(id)) m.setPaintProperty(id, 'raster-opacity', 0.55);
      m.triggerRepaint();
    }
  });
  await settle(1200);
  await p.screenshot({ path: `${WORK}/${name}-${size}-${theme}.png` });
  await ctx.close();
}

type Card = {
  view: Record<string, string | number>;
  /** Another map app's path (Compare), instead of the map. */
  path?: string;
  /** The one label, proposed for Ryan's word-for-word OK. */
  label: string;
  /** A frequency colour dot before the label (the tier's index), as the map's own key pills have. */
  dot?: number;
};

// One map treatment for every picture: the same zoom offset, the same faded basemap without place names.
const DAY = { p: 'midday', day: 'Weekday' };
const CARD_PICTURES: Record<string, Card> = {
  // For Planners: See Frequency, Not Just Routes. Only the routes every 15 min or better stay on.
  frequency: { view: { lat: 43.6555, lon: -79.3925, z: 12, ...DAY, h: 15 }, label: 'Every 15 min or better', dot: 1 },
  // For Planners: Service by Day, Time and Span. One time of day's own map: owl service.
  dayweek: { view: { lat: 41.8835, lon: -87.6528, z: 12, p: 'overnight', day: 'Weekday', h: 60 }, label: 'Weekday · Overnight' },
  // For Planners: Every Agency on One Map. Milpitas, where BART, VTA and others meet.
  agency: { view: { lat: 37.4135, lon: -121.8935, z: 12, ...DAY, h: 60 }, label: 'VTA · BART · AC Transit' },  // the three agencies this view draws
  // For Planners: Share What You Find. The link that opens this view.
  export: { view: { lat: 43.6700, lon: -79.4100, z: 12, ...DAY, h: 60 }, label: 'transitatlas.fyi/?lat=43.67&lon=-79.41…' },
  // For Researchers: Compare Cities on One Map. Compare's two maps side by side, weekday against Sunday.
  compare: { view: { lat: 43.6555, lon: -79.3925, z: 11.5, ...DAY, h: 60, cday: 'Sunday', cp: 'midday', ch: 60 }, path: '/apps/compare', label: 'Weekday · Sunday' },
  // For Researchers: Maps You Can Cite. The citation line every exported map carries.
  cite: { view: { lat: 43.6700, lon: -79.4100, z: 12, ...DAY, h: 60 }, label: 'Schedules from TTC · transitatlas.fyi' },
};
const CARDS = process.env.CARDS ? process.env.CARDS.split(',') : Object.keys(CARD_PICTURES);
const want = (card: string) => CARDS.includes(card);

// ONLY=compose reruns just the compose step from earlier captures in <work-dir>.
if (!process.env.ONLY) {
  for (const theme of THEMES) for (const size of Object.keys(SIZES) as Size[]) for (const [name, card] of Object.entries(CARD_PICTURES)) {
    if (want(name)) await mapShot(`map-${name}`, card, size, theme);
  }
}
await b.close();

// Compose: every picture is its map plus one label at the bottom left, in the map's own pill (MAP_BADGE): the panel
// surface, its border, bold 12-13 px text, a frequency colour dot where the label names a frequency.
const TIER = ['#22863a', '#3da44d', '#f59e0b', '#e07b2a', '#92400e', '#6b7280'];
const pal = (t: Theme) => t === 'dark'
  ? { bg: '#0a0a0a', panel: 'rgba(23,23,23,0.92)', border: 'rgba(255,255,255,0.12)', text: '#f4f4f5' }
  : { bg: '#f0f0f0', panel: 'rgba(255,255,255,0.94)', border: 'rgba(0,0,0,0.10)', text: '#111827' };
const f = (n: string) => `file://${WORK}/${n}.png`;
const MARGIN = (size: Size) => size === 'phone' ? 10 : 14;
const scene = (name: string, t: Theme, size: Size) => {
  const c = pal(t), card = CARD_PICTURES[name], small = size === 'phone';
  const dot = card.dot != null ? `<span style="display:inline-block;width:${small ? 8 : 10}px;height:${small ? 8 : 10}px;border-radius:50%;background:${TIER[card.dot]}"></span>` : '';
  return `<img src="${f(`map-${name}-${size}-${t}`)}" style="position:absolute;inset:0;width:100%;height:100%">`
    + `<div style="position:absolute;left:${MARGIN(size)}px;bottom:${MARGIN(size)}px;display:flex;align-items:center;gap:${small ? 6 : 8}px;height:${small ? 24 : 30}px;padding:0 ${small ? 10 : 12}px;border-radius:999px;background:${c.panel};border:1px solid ${c.border};color:${c.text};font:700 ${small ? 11 : 13}px Inter,ui-sans-serif,system-ui,sans-serif;white-space:nowrap">${dot}${card.label}</div>`;
};

const b2 = await launchBrowser();
for (const size of Object.keys(SIZES) as Size[]) {
  const { w, h } = SIZES[size];
  const { ctx, page: p } = await openPage(b2, { width: w, height: h, dpr: size === 'phone' ? 3 : 2 });
  for (const name of Object.keys(CARD_PICTURES).filter(want)) for (const t of THEMES) {
    const html = `${WORK}/scene.html`;
    writeFileSync(html, `<html><body style="margin:0;background:${pal(t).bg}"><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${scene(name, t, size)}</div></body></html>`);
    await p.goto(`file://${html}`); await p.waitForLoadState('load'); await p.waitForTimeout(150);
    const png = `${WORK}/card-${name}-${size}-${t}.png`;
    await p.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '85', png, '-o', `${ASSETS}/card-${name}-${size}-${t}.webp`]);
  }
  await ctx.close();
}
await b2.close();
console.log('ok');
