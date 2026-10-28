// Overlap check for the map's fixed overlays (CIV-1011 #12). Usage:
//   node scripts/check-overlay-overlap.mjs <baseUrl> [screenshotDir]
// Needs a running dev server. At 360, 640, 820, 1024 and 1440 wide it opens the map four times: as a default visitor, as
// one from a strict-consent country (so the analytics prompt shows), with the on-demand areas failing to load (so the
// map notice pill shows, CIV-1057), and with both. It measures every overlay marked data-map-overlay (styles.ts, "Map overlay slots"):
// the header's left and right groups, the footer pills, the counts, the map controls, notice and status pills, and the
// analytics prompt. Each overlay is measured by its visible pieces, not its container, so a full-width row only counts
// where something is drawn. It fails when two overlays' pieces overlap, or when a piece runs off the screen.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [baseUrl = 'http://localhost:5180', outDir] = process.argv.slice(2);
const WIDTHS = [360, 640, 820, 1024, 1440];
const HEIGHT = 900;
const SETTLE_MS = 6000;

/** Every overlay's visible pieces, in page coordinates. The header splits into its left and right groups. */
function measure() {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.width > 1 && r.height > 1;
  };
  /** The overlay's drawn pieces: leaf-ish children with a box, merged per direct child. */
  const pieces = (root) => [...root.children].filter(visible).map(child => {
    const r = child.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const out = [];
  for (const el of document.querySelectorAll('[data-map-overlay]')) {
    const name = el.getAttribute('data-map-overlay');
    if (name === 'top-bar') {
      [...el.children].filter(visible).forEach((group, i) => out.push({ name: `top-bar:${i === 0 ? 'left' : 'right'}`, boxes: pieces(group).length ? pieces(group) : [] }));
      continue;
    }
    if (!visible(el) && getComputedStyle(el).display !== 'contents') continue;
    const boxes = pieces(el);
    if (boxes.length) out.push({ name, boxes });
  }
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
const browser = await chromium.launch();
const failures = [];
try {
  for (const width of WIDTHS) for (const visitor of ['default', 'consent', 'notice', 'consent-notice']) {
    const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const page = await ctx.newPage();
    // A visitor from a strict-consent country sees the analytics prompt; the default visitor doesn't.
    if (visitor.startsWith('consent')) await page.route('**/api/privacy-region*', route => route.fulfill({ json: { country: 'FR' } }));
    // On-demand areas that fail to load put the notice pill along the bottom edge.
    if (visitor.endsWith('notice')) await page.route('**/on-demand/manifest.json*', route => route.fulfill({ status: 500, body: '' }));
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-map-overlay="top-bar"]', { timeout: 30000 });
    await page.waitForTimeout(SETTLE_MS);
    const { overlays, viewport } = await page.evaluate(measure);
    const names = overlays.map(o => `${o.name}(${o.boxes.length})`).join(' ');
    console.log(`${width} ${visitor}: ${names}`);
    for (const o of overlays) for (const b of o.boxes) {
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > viewport.w + 0.5 || b.y + b.h > viewport.h + 0.5) failures.push(`${width} ${visitor}: ${o.name} runs off the screen (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
    }
    for (let i = 0; i < overlays.length; i++) for (let j = i + 1; j < overlays.length; j++) {
      for (const a of overlays[i].boxes) for (const b of overlays[j].boxes) {
        if (overlaps(a, b)) failures.push(`${width} ${visitor}: ${overlays[i].name} overlaps ${overlays[j].name}`);
      }
    }
    if (outDir) await page.screenshot({ path: `${outDir}/overlays-${width}-${visitor}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
const unique = [...new Set(failures)];
if (unique.length) {
  console.error(unique.join('\n'));
  console.error(`\n${unique.length} overlay problem(s).`);
  process.exit(1);
}
console.log('No overlay overlaps at', WIDTHS.join(', '));
