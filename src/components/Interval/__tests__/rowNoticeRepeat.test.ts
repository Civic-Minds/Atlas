import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as copy from '../../../content/noticeCopy';

/**
 * CIV-1916 (Ryan: "why would we show the same info twice"): a route-card row is plain; a reason lives only in the
 * card's bottom notice. A row's hover text or icon label never carries notice wording: no copy constant whose words
 * are part of another copy constant (a notice, its lead or its explainer).
 */
const ROW_FILES = ['src/components/Interval/RouteDirectionRow.tsx', 'src/components/Interval/panels/RouteCardHeadway.tsx', 'src/components/Interval/cardUi.tsx'];
const strings = Object.entries(copy).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length >= 30);

describe('route-card rows never repeat a notice (CIV-1916)', () => {
  it('no row hover text or icon label is notice wording', () => {
    const offenders: string[] = [];
    for (const file of ROW_FILES) {
      const src = readFileSync(resolve(file), 'utf8');
      for (const m of src.matchAll(/(?:title|aria-label)=\{([A-Z][A-Z0-9_]+)\}/g)) {
        const name = m[1];
        const text = (copy as Record<string, unknown>)[name];
        if (typeof text !== 'string') continue;
        const inNotice = strings.some(([other, value]) => other !== name && value.includes(text));
        if (inNotice) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('the first-or-last-trip row icon is gone: its words stay in the bottom notice only', () => {
    expect(readFileSync(resolve('src/components/Interval/RouteDirectionRow.tsx'), 'utf8')).not.toMatch(/FIRST_LAST_TRIP_ALLOWANCE_HINT|edgeGapAllowance/);
    expect(copy.EDGE_GAP_ALLOWANCE_LEAD).toContain(copy.FIRST_LAST_TRIP_ALLOWANCE_HINT);
  });
});
