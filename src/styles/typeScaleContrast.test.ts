import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'index.css'), 'utf8');

type Rgba = [number, number, number, number];

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = block(':root');
const DARK = { ...LIGHT, ...block("[data-theme='dark']") };
const HC = { ...LIGHT, ...block("[data-color-vision='high-contrast']") };
const DARK_HC = { ...DARK, ...block("[data-color-vision='high-contrast']"), ...block("[data-theme='dark'][data-color-vision='high-contrast']") };

const THEMES: Record<string, Record<string, string>> = { light: LIGHT, dark: DARK, 'light high-contrast': HC, 'dark high-contrast': DARK_HC };

function parse(value: string, vars: Record<string, string>): Rgba {
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return parse(vars[ref[1]], vars);
  if (v.startsWith('#')) {
    const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (!m) throw new Error(`cannot parse ${v}`);
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: Rgba) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('text colour tokens meet WCAG AA (4.5:1) in every theme', () => {
  const TEXT = ['--text-primary', '--text-secondary', '--text-muted', '--text-dim', '--text-legend', '--accent',
    '--status-positive-text', '--status-negative-text', '--status-caution-text'];

  for (const [name, vars] of Object.entries(THEMES)) {
    const app = parse(vars['--bg-app'], vars);
    const header = parse(vars['--bg-header'], vars);
    const panel = over(parse(vars['--bg-panel'], vars), app);
    const btn = over(parse(vars['--bg-btn'], vars), panel);
    const surfaces: Record<string, Rgba> = { 'bg-app': app, 'bg-header': header, 'bg-panel': panel, 'bg-btn': btn };

    for (const token of TEXT) {
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        it(`${name}: ${token} on ${surfaceName}`, () => {
          expect(contrast(over(parse(vars[token], vars), surface), surface)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    for (const kind of ['warn', 'danger']) {
      it(`${name}: status-${kind} text on its badge background`, () => {
        const bg = over(parse(vars[`--status-${kind}-bg`], vars), app);
        expect(contrast(parse(vars[`--status-${kind}-text`], vars), bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('high-contrast greys are at least as strong as the standard ones', () => {
    for (const [std, hc] of [[LIGHT, HC], [DARK, DARK_HC]] as const) {
      const app = parse(std['--bg-app'], std);
      for (const token of ['--text-muted', '--text-dim']) {
        const a = contrast(over(parse(std[token], std), app), app);
        const b = contrast(over(parse(hc[token], hc), app), app);
        expect(b).toBeGreaterThanOrEqual(a);
      }
    }
  });
});

describe('type scale', () => {
  it('defines the scale tokens with a 12px floor for readable text', () => {
    const px = (n: string) => Number(css.match(new RegExp(`--text-${n}:\\s*(\\d+)px`))?.[1]);
    expect([px('xs'), px('sm'), px('base'), px('lg'), px('xl')]).toEqual([12, 13, 14, 16, 20]);
  });

  it('keeps hard-coded font sizes below 12px out of the UI (use text-xs, or text-2xs for decorative marks)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) { if (entry !== 'node_modules') walk(p); continue; }
        if (!/\.(tsx?|css)$/.test(entry) || /\.test\./.test(entry)) continue;
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/text-\[([\d.]+)(px|rem)\]/g)) {
          const px = m[2] === 'rem' ? parseFloat(m[1]) * 14 : parseFloat(m[1]);
          if (px < 12) offenders.push(`${p}: ${m[0]}`);
        }
      }
    };
    walk(join(__dirname, '..'));
    expect(offenders).toEqual([]);
  });
});

import { getFareColor, readableTextOn, FARE_TIERS } from '../utils/colors';

describe('readableTextOn', () => {
  it('picks text that reaches 4.5:1 on every fare tier colour', () => {
    for (const tier of FARE_TIERS) {
      const bg = parse(tier.color, {});
      const fg = parse(readableTextOn(tier.color), {});
      expect(contrast(fg, bg), tier.label).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableTextOn(getFareColor(3))).toBe('#111827');
    expect(readableTextOn('#0072b2')).toBe('#ffffff');
  });
});
