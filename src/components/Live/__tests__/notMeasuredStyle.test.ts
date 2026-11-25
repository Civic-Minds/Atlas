import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-2912: "Under 0.5 min" and "Not measured" were near-identical greys in the Studio Live key, and the same grey on the map,
// so a planner couldn't tell nothing lost from not measured. Not measured is dashed on the map and in the key.
const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

describe('not measured reads apart from step 0 (CIV-2912)', () => {
  it('the key draws Not measured with the shared dashed swatch, not a faded grey', () => {
    const key = read('components/Live/LiveMapKey.tsx');
    expect(key).toMatch(/NOT_MEASURED_SWATCH = dashedLineSwatch\(/);
    expect(key).not.toMatch(/opacity-45/);
  });

  it('the map draws a segment with no figure on its own dashed layer', () => {
    const layer = read('components/Interval/map/PageMapLayer.tsx');
    expect(layer).toMatch(/nm: s\.step == null && !s\.color \? 1 : 0/);
    expect(layer).toMatch(/id\('seg-nm'\)[^\n]*'line-dasharray': DASHED_LINE/);
    expect(read('components/Interval/map/mapHitTargets.ts')).toMatch(/layerId\('seg-nm'\)/);
  });
});
