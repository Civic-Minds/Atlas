import { describe, expect, it } from 'vitest';
import * as copy from '../noticeCopy';

// CIV-3163 (Ryan, 2026-11-27): "There's "apps" and "modes" but not "views"". No shared label calls an app or a mode a view.
// What stays: "View" as a verb ("View on map"), what the map shows now ("in view", "this view", "same view") and
// MEASURE_LABEL, which is "Views" by his pick (CIV-3160).
const ALLOWED = /^View\b|\bin (this )?view\b|\bsame view\b|\bThis view\b|\bpage views\b/;

function strings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
}

describe('noticeCopy: apps and modes, never "views"', () => {
  it('no shared label calls an app or mode a view', () => {
    const all: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(copy)) if (name !== 'MEASURE_LABEL') strings(value, name, all);
    const bad = all.filter(([, s]) => /\bviews?\b/i.test(s) && !ALLOWED.test(s)).map(([p, s]) => `${p}: ${s}`);
    expect(bad).toEqual([]);
  });

  it('the measure pill reads "Views"', () => {
    expect(copy.MEASURE_LABEL).toBe('Views');
  });
});
