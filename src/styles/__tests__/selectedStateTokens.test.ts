import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const root = block(':root');
const dark = block("[data-theme='dark']");
const hc = block("[data-color-vision='high-contrast']");
const darkHc = block("[data-theme='dark'][data-color-vision='high-contrast']");

const THEMES = {
  light: { tokens: { ...root }, page: '#ffffff' },
  dark: { tokens: { ...root, ...dark }, page: '#0f0f0f' },
  'high contrast': { tokens: { ...root, ...hc }, page: '#ffffff' },
  'dark high contrast': { tokens: { ...root, ...dark, ...hc, ...darkHc }, page: '#0f0f0f' },
};

type Rgb = [number, number, number];

function resolveToken(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  if (value === undefined) throw new Error(`undefined token ${name}`);
  for (let i = 0; i < 10; i++) {
    const m = value.match(/^var\((--[\w-]+)\)$/);
    if (!m) return value;
    value = tokens[m[1]];
    if (value === undefined) throw new Error(`undefined token ${m[1]}`);
  }
  throw new Error(`token loop at ${name}`);
}

function parse(color: string, page: Rgb): Rgb {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb;
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) throw new Error(`unparseable colour ${color}`);
  const [r, g, b, a = 1] = rgba[1].split(',').map(Number);
  return [r, g, b].map((c, i) => c * a + page[i] * (1 - a)) as Rgb;
}

const luminance = ([r, g, b]: Rgb) => {
  const lin = [r, g, b].map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(Object.entries(THEMES))('selected-state tokens (%s)', (_name, { tokens, page }) => {
  const pageRgb = parse(page, [255, 255, 255]);
  const get = (name: string) => parse(resolveToken(tokens, name), pageRgb);

  it('selected text is readable on the selected fill', () => {
    expect(contrast(get('--control-active-fg'), get('--control-active-bg'))).toBeGreaterThanOrEqual(7);
  });

  it('selected fill stands out from the surface an unselected pill sits on', () => {
    expect(contrast(get('--control-active-bg'), pageRgb)).toBeGreaterThanOrEqual(3);
  });

  it('selected list rows keep text readable and have a clear edge', () => {
    const bg = get('--selection-active-bg');
    expect(contrast(get('--selection-active-fg'), bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(get('--selection-active-border'), pageRgb)).toBeGreaterThanOrEqual(3);
  });

  it('toggle on and off are distinct, and the on knob is visible on the on track', () => {
    expect(contrast(get('--toggle-on-bg'), get('--toggle-off-bg'))).toBeGreaterThanOrEqual(2);
    expect(contrast(get('--toggle-knob-on'), get('--toggle-on-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(get('--toggle-knob-off'), get('--toggle-off-bg'))).toBeGreaterThanOrEqual(2);
  });
});
