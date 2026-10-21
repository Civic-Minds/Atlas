// Browser check for the Atlas home logo (#1058). Usage:
//   node scripts/check-logo-icon.mjs <baseUrl> [screenshotDir]
// Needs a running dev server. Checks desktop (1440) and phone (390) in both app themes and both
// OS colour schemes, from computed styles of the real DOM. Exits 1 on any failure.
//   - light theme: disc luminance must be >= 0.6 (no near-black disc)
//   - dark theme: disc luminance must be <= 0.25 (no pale disc with a pale icon)
//   - icon vs disc contrast ratio must be >= 4.5 in every state
import { chromium } from 'playwright';

const [baseUrl = 'http://localhost:5181/', outDir] = process.argv.slice(2);
const MIN_CONTRAST = 4.5;
const MIN_LIGHT_DISC_LUM = 0.6;
const MAX_DARK_DISC_LUM = 0.25;

const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
const over = ([r, g, b, a = 1], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const browser = await chromium.launch();
const failures = [];
try {
  for (const [width, height, size] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    for (const os of ['light', 'dark']) {
      for (const theme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: os });
        await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
        const page = await ctx.newPage();
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        const btn = page.locator('button[aria-label="Atlas home"]');
        await btn.waitFor({ timeout: 30000 });
        await page.waitForTimeout(1500);
        const m = await btn.evaluate((b) => {
          const disc = b.querySelector('span');
          return {
            dataTheme: document.documentElement.dataset.theme,
            page: getComputedStyle(document.body).backgroundColor,
            appBg: getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim(),
            disc: getComputedStyle(disc).backgroundColor,
            icon: getComputedStyle(disc.querySelector('svg')).color,
          };
        });
        const pageRgb = parse(m.page).slice(0, 3);
        const base = pageRgb.length === 3 && parse(m.page)[3] !== 0 ? pageRgb : (theme === 'dark' ? [15, 15, 15] : [255, 255, 255]);
        const disc = over(parse(m.disc), base);
        const icon = over(parse(m.icon), disc);
        const L = lum(disc), C = contrast(icon, disc);
        const name = `${size}-os${os}-app${theme}`;
        const problems = [];
        if (m.dataTheme !== theme) problems.push(`data-theme is ${m.dataTheme}, expected ${theme}`);
        if (theme === 'light' && L < MIN_LIGHT_DISC_LUM) problems.push(`disc is near-black (luminance ${L.toFixed(2)} < ${MIN_LIGHT_DISC_LUM})`);
        if (theme === 'dark' && L > MAX_DARK_DISC_LUM) problems.push(`disc is pale in dark theme (luminance ${L.toFixed(2)} > ${MAX_DARK_DISC_LUM})`);
        if (C < MIN_CONTRAST) problems.push(`icon/disc contrast ${C.toFixed(2)} < ${MIN_CONTRAST}`);
        console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name} disc=rgb(${disc.map(Math.round)}) icon=rgb(${icon.map(Math.round)}) contrast=${C.toFixed(2)} ${problems.join('; ')}`);
        if (problems.length) failures.push(`${name}: ${problems.join('; ')}`);
        if (outDir) await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: 0, width: Math.min(width, 520), height: 80 } });
        if (outDir && os === 'light' && theme === 'light') {
          await btn.hover(); await page.waitForTimeout(400);
          await page.screenshot({ path: `${outDir}/${name}-hover.png`, clip: { x: 0, y: 0, width: Math.min(width, 520), height: 80 } });
          await page.mouse.move(700, 500);
          await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
          await btn.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
          await page.screenshot({ path: `${outDir}/${name}-focus.png`, clip: { x: 0, y: 0, width: Math.min(width, 520), height: 80 } });
        }
        // Focus ring: no near-black outline/ring after a click, a visible light ring after Tab.
        const ringInfo = () => btn.evaluate((b) => { const c = getComputedStyle(b); return { outline: c.outlineStyle === 'none' ? '' : c.outlineColor + ' ' + c.outlineWidth, shadow: c.boxShadow, radius: c.borderTopLeftRadius }; });
        const ringColors = (r) => [...(r.outline ? [r.outline] : []), r.shadow !== 'none' ? r.shadow : ''].join(' ').match(/rgba?\([^)]*\)/g) || [];
        const dark = (c) => { const v = parse(c); return (v[3] ?? 1) > 0.5 && lum(v.slice(0, 3)) < 0.2; };
        await btn.click(); await page.waitForTimeout(300);
        const afterClick = await ringInfo();
        if (ringColors(afterClick).some(dark)) { failures.push(`${name}: near-black ring after click ${JSON.stringify(afterClick)}`); console.log('FAIL', name, 'click ring', JSON.stringify(afterClick)); }
        if (outDir) await page.screenshot({ path: `${outDir}/${name}-afterclick.png`, clip: { x: 0, y: 0, width: Math.min(width, 520), height: 80 } });
        await page.mouse.move(width - 5, height - 5); await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.keyboard.press('Tab'); await page.waitForTimeout(300);
        const onLogo = await btn.evaluate((b) => b === document.activeElement);
        const afterTab = await ringInfo();
        const tabColors = ringColors(afterTab);
        if (!onLogo) { failures.push(`${name}: first Tab did not reach the logo`); console.log('FAIL', name, 'tab target'); }
        else if (!tabColors.length) { failures.push(`${name}: no visible ring after Tab`); console.log('FAIL', name, 'no ring'); }
        else if (tabColors.some(dark)) { failures.push(`${name}: near-black ring after Tab ${JSON.stringify(afterTab)}`); console.log('FAIL', name, 'dark tab ring'); }
        console.log(`     ${name} click=${JSON.stringify(afterClick)} tab=${JSON.stringify(afterTab)}`);
        if (outDir) await page.screenshot({ path: `${outDir}/${name}-aftertab.png`, clip: { x: 0, y: 0, width: Math.min(width, 520), height: 80 } });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\n${failures.length} state(s) failed`); process.exit(1); }
console.log('\nall 8 states pass');
