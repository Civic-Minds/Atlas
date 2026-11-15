/**
 * CIV-1550: blend an element's colour tokens from the reader's light theme to Atlas's dark tokens, 0 (light) to 1 (dark),
 * for the airport story's day-to-night scroll. Both palettes are read from the stylesheet (the light one from the root,
 * the dark one from a hidden `data-theme="dark"` probe), never hard-coded.
 *
 * Surfaces and borders blend smoothly. Text and the accent cannot: halfway between light and dark is a mid grey that
 * neither theme's text reads on. So text keeps the light theme's colours while black text out-contrasts white on the
 * blended background and the dark theme's after; at every point each text token is pushed toward pure black or white just
 * far enough to keep 4.5:1 against the background (3:1 for the accent, which colours map dots).
 */

type Rgba = [number, number, number, number];

const SURFACES = ['--bg-app', '--bg-panel', '--border-primary'] as const;
// Targets carry a small margin over 4.5:1 and 3:1 so rounding to whole RGB values never dips below them.
const TEXT: Record<string, number> = { '--text-primary': 4.6, '--text-muted': 4.6, '--text-dim': 4.6, '--accent': 3.1 };
const NAMES = [...SURFACES, ...Object.keys(TEXT)];

let probe: HTMLElement | null = null;
let darkCache: Record<string, Rgba> | null = null;

function probeEl(): HTMLElement {
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  return probe;
}

/** Any CSS colour to [r, g, b, a] by letting the browser resolve it. */
function resolve(value: string): Rgba {
  const el = probeEl();
  el.style.color = '';
  el.style.color = value;
  const m = getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [m[0], m[1], m[2], m[3] ?? 1];
}

function palette(from: Element): Record<string, Rgba> {
  const css = getComputedStyle(from);
  return Object.fromEntries(NAMES.map(n => [n, resolve(css.getPropertyValue(n).trim())]));
}

function darkPalette(): Record<string, Rgba> {
  if (darkCache) return darkCache;
  const el = document.createElement('div');
  el.setAttribute('data-theme', 'dark');
  el.style.display = 'none';
  document.body.appendChild(el);
  darkCache = palette(el);
  el.remove();
  return darkCache;
}

const mix = (a: Rgba, b: Rgba, t: number): Rgba => [0, 1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t) as Rgba;
const over = (fg: Rgba, bg: Rgba): Rgba => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as Rgba;
const css = (c: Rgba) => `rgba(${c.slice(0, 3).map(v => Math.round(v)).join(', ')}, ${Math.round(c[3] * 1000) / 1000})`;

function luminance([r, g, b]: Rgba): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BLACK: Rgba = [0, 0, 0, 1];
const WHITE: Rgba = [255, 255, 255, 1];

/** The blended token values at progress p, with each text token's contrast against the blended background. */
export function nightTokens(p: number, light: Record<string, Rgba>, dark: Record<string, Rgba>) {
  const bg = over(mix(light['--bg-app'], dark['--bg-app'], p), WHITE);
  const darkText = contrast(WHITE, bg) > contrast(BLACK, bg);
  const side = darkText ? dark : light;
  const pole = darkText ? WHITE : BLACK;
  const values: Record<string, string> = {};
  const ratios: Record<string, number> = {};
  for (const n of SURFACES) values[n] = css(mix(light[n], dark[n], p));
  for (const [n, min] of Object.entries(TEXT)) {
    let c = over(side[n], bg);
    for (let t = 0.05; contrast(c, bg) < min && t <= 1.0001; t += 0.05) c = mix(over(side[n], bg), pole, t);
    values[n] = css(c);
    ratios[n] = contrast(c, bg);
  }
  return { values, ratios };
}

/** Put the tokens for progress p on el. The light palette is the root's, so a reader's high-contrast setting carries. */
export function applyNightBlend(el: HTMLElement, p: number): void {
  const { values } = nightTokens(p, palette(document.documentElement), darkPalette());
  for (const [n, v] of Object.entries(values)) el.style.setProperty(n, v);
}

export function clearNightBlend(el: HTMLElement): void {
  for (const n of NAMES) el.style.removeProperty(n);
}
