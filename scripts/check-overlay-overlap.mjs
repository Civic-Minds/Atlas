// Overlap check for the map's fixed overlays (CIV-1011 #12, CIV-1136). Usage:
//   node scripts/check-overlay-overlap.mjs <baseUrl> [screenshotDir] [--scenes=frequency,history,...]
// Needs a running dev server. At 360, 390, 768, 1024 and 1280 wide it opens each map scene: the Frequency map as a
// default visitor, as one from a strict-consent country (so the analytics prompt shows), with the on-demand areas failing
// to load (so the notice pill shows, CIV-1057), and with both; the map key switched on (with and without the notice);
// Night; Frequent Service; History with an agency open (its year scrubber); Compare; and Live. It measures every overlay
// marked data-map-overlay (src/mapOverlayLayout.ts): the header's left and right groups, the footer pills, the counts, the
// map controls, key, notice and status pills, the update banner, History's scrubber, Compare's labels and link, Live's
// toolbar, the logo and search box apart, every side panel or card, and the analytics prompt. Each overlay is measured by its visible pieces, not its container, so a full-width
// row only counts where something is drawn. It fails when two overlays' pieces overlap, or when a piece runs off the screen.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--scenes='))?.slice(9).split(',');
const [baseUrl = 'http://localhost:5180', outDir] = args.filter(a => !a.startsWith('--'));
/** The map scenes: where to open, which visitors, and anything to do before measuring. */
const SCENES = [
  { name: 'frequency', path: '/', visitors: ['default', 'consent', 'notice', 'consent-notice'] },
  { name: 'key', path: '/', visitors: ['default', 'notice'], key: true },
  { name: 'night', path: '/research/night', visitors: ['default'] },
  { name: 'frequent', path: '/research/frequent-service', visitors: ['default'] },
  // An agency with several years, so the year scrubber shows (History is off on phones: the map shows instead).
  { name: 'history', path: '/apps/history?agency=marta', visitors: ['default'] },
  // Compare is off on phones (phoneModeFlags), so it starts at the sm width.
  { name: 'compare', path: '/', visitors: ['default'], minWidth: 640, open: page => page.getByRole('button', { name: 'Compare two maps' }).click() },
  { name: 'live', path: '/apps/live', visitors: ['default'] },
].filter(s => !only || only.includes(s.name));
const WIDTHS = [360, 390, 768, 1024, 1280];
const HEIGHT = 900;
const SETTLE_MS = 6000;

/** Every overlay's visible pieces, in page coordinates. The header splits into its left and right groups. */
function measure() {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.width > 1 && r.height > 1;
  };
  /** The overlay's drawn pieces, one per direct child: the child's box grown to cover any descendant drawn outside
   *  it, so a pill that spills out of a squeezed group is measured where it is drawn (CIV-1057, About Atlas at 640).
   *  The header's groups keep their own boxes: their search field and menus hold descendants laid out off the bar. */
  const pieces = (root, spill = true) => [...root.children].filter(visible).map(child => {
    const r = child.getBoundingClientRect();
    let [x1, y1, x2, y2] = [r.left, r.top, r.right, r.bottom];
    for (const d of spill ? child.querySelectorAll('*') : []) {
      if (!visible(d)) continue;
      const b = d.getBoundingClientRect();
      x1 = Math.min(x1, b.left); y1 = Math.min(y1, b.top); x2 = Math.max(x2, b.right); y2 = Math.max(y2, b.bottom);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });
  const out = [];
  for (const el of document.querySelectorAll('[data-map-overlay]')) {
    const name = el.getAttribute('data-map-overlay');
    if (name === 'top-bar') {
      // The left group's pieces (the logo, the search box) are measured against each other too: a long search box can
      // run over the logo's words (CIV-1136). The right group's buttons count as one.
      [...el.children].filter(visible).forEach((group, i) => {
        if (i === 0) [...group.children].filter(visible).forEach((piece, k) => { const r = piece.getBoundingClientRect(); out.push({ name: `top-bar:left:${k === 0 ? 'logo' : k === 1 ? 'search' : k}`, boxes: [{ x: r.left, y: r.top, w: r.width, h: r.height }] }); });
        else out.push({ name: 'top-bar:right', boxes: pieces(group, false) });
      });
      continue;
    }
    if (!visible(el) && getComputedStyle(el).display !== 'contents') continue;
    const boxes = pieces(el);
    if (boxes.length) out.push({ name, boxes });
  }
  // The side panels and cards (every one is placed by sidebarFrameStyle, which sets --sidebar-left): each is one box.
  document.querySelectorAll('[style*="--sidebar-left"]').forEach((el, i) => {
    if (!visible(el) || el.closest('[data-map-overlay]')) return;
    const r = el.getBoundingClientRect();
    out.push({ name: `side-panel:${el.getAttribute('aria-label') || el.querySelector('h2,h3,[class*="font-black"]')?.textContent?.trim().slice(0, 24) || i}`, boxes: [{ x: r.left, y: r.top, w: r.width, h: r.height }] });
  });
  // The analytics prompt's own fixed copy (phones); on wider screens it is a pill inside the footer row, measured there.
  const pill = [...document.querySelectorAll('[role="dialog"][aria-label="Analytics consent"]')].find(el => visible(el) && !el.closest('[data-map-overlay]'));
  if (pill) {
    const r = pill.getBoundingClientRect();
    out.push({ name: 'consent', boxes: [{ x: r.left, y: r.top, w: r.width, h: r.height }] });
  }
  return { overlays: out, viewport: { w: innerWidth, h: innerHeight } };
}

const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

if (outDir) mkdirSync(outDir, { recursive: true });
// PW_CHROMIUM: a local Chromium to use instead of Playwright's own download.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const failures = [];
const skipped = [];
try {
  for (const width of WIDTHS) for (const scene of SCENES) for (const visitor of scene.visitors) {
    if (scene.minWidth && width < scene.minWidth) continue;
    const label = `${width} ${scene.name} ${visitor}`;
    const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const page = await ctx.newPage();
    // A visitor from a strict-consent country sees the analytics prompt; the default visitor doesn't.
    if (visitor.startsWith('consent')) await page.route('**/api/privacy-region*', route => route.fulfill({ json: { country: 'FR' } }));
    // On-demand areas that fail to load put the notice pill along the bottom edge.
    if (visitor.endsWith('notice')) await page.route('**/on-demand/manifest.json*', route => route.fulfill({ status: 500, body: '' }));
    // The map key is a setting (Settings, "Show map legend"), off by default.
    if (scene.key) await page.addInitScript(() => { try { localStorage.setItem('atlas_pref_map_legend', 'true'); } catch {} });
    await page.goto(baseUrl + scene.path, { waitUntil: 'domcontentloaded' });
    // A scene this build doesn't have (Live switched off) is reported and skipped, not counted as an overlap.
    const opened = await page.waitForSelector('[data-map-overlay="top-bar"]', { timeout: 30000 }).then(() => true, () => false);
    if (!opened) { skipped.push(label); await ctx.close(); continue; }
    if (scene.open) await scene.open(page).catch(err => failures.push(`${label}: could not open the scene (${String(err).split('\n')[0]})`));
    await page.waitForTimeout(SETTLE_MS);
    // Measure the settled map, not one still loading: the loading pill and half-drawn counts change the bottom row.
    await page.waitForFunction(() => !/Loading/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    const { overlays, viewport } = await page.evaluate(measure);
    const names = overlays.map(o => `${o.name}(${o.boxes.length})`).join(' ');
    console.log(`${label}: ${names}`);
    for (const o of overlays) for (const b of o.boxes) {
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > viewport.w + 0.5 || b.y + b.h > viewport.h + 0.5) failures.push(`${label}: ${o.name} runs off the screen (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
    }
    for (let i = 0; i < overlays.length; i++) for (let j = i + 1; j < overlays.length; j++) {
      for (const a of overlays[i].boxes) for (const b of overlays[j].boxes) {
        if (overlaps(a, b)) failures.push(`${label}: ${overlays[i].name} overlaps ${overlays[j].name}`);
      }
    }
    if (outDir) await page.screenshot({ path: `${outDir}/overlays-${width}-${scene.name}-${visitor}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (skipped.length) console.log(`Skipped (the scene did not open in this build): ${skipped.join('; ')}`);
const unique = [...new Set(failures)];
if (unique.length) {
  console.error(unique.join('\n'));
  console.error(`\n${unique.length} overlay problem(s).`);
  process.exit(1);
}
console.log('No overlay overlaps at', WIDTHS.join(', '));
