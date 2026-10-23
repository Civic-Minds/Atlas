// Cross-device check for the shared Atlas logo (CIV-508, #1058). Usage:
//   node scripts/check-logo-consistency.mjs <baseUrl> [screenshotDir]
// Needs a running dev server. For every surface and theme it measures the logo disc and the
// "Atlas" wordmark at 390, 768, 1024 and 1440 and fails if size, fill, border, shadow, icon
// colour, font size, weight or colour differ between widths (only position may differ).
import { chromium } from 'playwright';

const [baseUrl = 'http://localhost:5181', outDir] = process.argv.slice(2);
const WIDTHS = [390, 768, 1024, 1440];
const SURFACES = [
  { name: 'map', path: '/' },
  { name: 'history', path: '/', click: 'button[aria-label="Back to frequency map"], button[aria-label="Historical service"]', logo: 'button[aria-label="Atlas home"], button[aria-label="Back to frequency map"]' },
  { name: 'research', path: '/research/frequent-service' },
  { name: 'diag-uneven', path: '/dev/diagnostics/uneven-headway' },
  { name: 'diag-perf', path: '/dev/diagnostics/performance' },
  { name: 'content-about', path: '/about' },
  { name: 'content-research-index', path: '/research' },
];
const LOGO = 'button[aria-label="Atlas home"], button[aria-label="Back to frequency map"], a[aria-label="Back to the frequency map"], a[aria-label="Atlas by Civic Minds"]';

const browser = await chromium.launch();
const failures = [];
const rows = [];
try {
  for (const surface of SURFACES) {
    for (const theme of ['light', 'dark']) {
      const results = [];
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
        await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
        const page = await ctx.newPage();
        await page.goto(baseUrl + surface.path, { waitUntil: 'domcontentloaded' });
        const logo = page.locator(LOGO).first();
        try { await logo.waitFor({ timeout: 30000 }); } catch { results.push({ width, missing: true }); await ctx.close(); continue; }
        if (surface.click) {
          const tab = page.locator('button[aria-label="Historical service"]').first();
          if (await tab.count()) { await tab.click(); await page.waitForTimeout(1500); }
        }
        await page.waitForTimeout(1200);
        const m = await page.locator(LOGO).first().evaluate((el) => {
          const box = (e) => { const r = e.getBoundingClientRect(); return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`; };
          const disc = [...el.querySelectorAll('span, div')].find((e) => e.querySelector('svg'));
          const word = [...el.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Atlas');
          const dc = disc && getComputedStyle(disc);
          const ic = disc && getComputedStyle(disc.querySelector('svg'));
          const wc = word && getComputedStyle(word);
          const by = [...el.querySelectorAll('span')].find((e) => e.textContent.trim() === 'by Civic Minds' && e.children.length === 0);
          const bc = by && getComputedStyle(by);
          return {
            discBox: disc ? box(disc) : '-', discFill: dc?.backgroundColor ?? '-', discBorder: dc ? `${dc.borderTopWidth} ${dc.borderTopColor}` : '-',
            discShadow: dc?.boxShadow ?? '-', discBlur: dc?.backdropFilter ?? '-', iconColor: ic?.color ?? '-', iconBox: disc ? box(disc.querySelector('svg')) : '-',
            wordBox: word ? box(word) : '-', wordFont: wc ? `${wc.fontSize}/${wc.fontWeight}/${wc.color}` : '-',
            bylineShown: by ? getComputedStyle(by).display !== 'none' : false, bylineFont: bc && bc.display !== 'none' ? `${bc.fontSize}/${bc.color}` : '-',
          };
        });
        results.push({ width, ...m });
        if (outDir) await page.screenshot({ path: `${outDir}/${surface.name}-${theme}-${width}.png`, clip: { x: 0, y: 0, width: Math.min(width, 640), height: 90 } });
        await ctx.close();
      }
      const found = results.filter((r) => !r.missing);
      const ref = found[found.length - 1];
      for (const r of results) rows.push({ surface: surface.name, theme, ...r });
      if (!found.length) { failures.push(`${surface.name}/${theme}: logo not found`); continue; }
      for (const r of found) {
        for (const k of ['discBox', 'discFill', 'discBorder', 'discShadow', 'discBlur', 'iconColor', 'iconBox', 'wordBox', 'wordFont']) {
          if (r[k] !== ref[k]) failures.push(`${surface.name}/${theme}: ${k} differs at ${r.width} (${r[k]}) vs ${ref.width} (${ref[k]})`);
        }
      }
    }
  }
} finally {
  await browser.close();
}
console.table(rows);
if (failures.length) { console.error(`${failures.length} difference(s)`); failures.forEach((f) => console.error(' -', f)); process.exit(1); }
console.log('logo identical across 390/768/1024/1440 on every surface');
