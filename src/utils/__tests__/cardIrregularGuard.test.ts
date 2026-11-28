import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardIrregularFeatures, cardIrregularRouteKeys } from '../frequencySegments';

/**
 * CIV-2925 (Ryan, 2026-11-24, "1"): with "hide irregular routes" on, a line whose card reads "Irregular" leaves the map,
 * the route count and the lists. All three read one rule, cardIrregularFeatures (the card's own model); a second copy of
 * the rule would let the map and the count disagree.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('lines whose card reads "Irregular" share one rule (CIV-2925)', () => {
  it('the map and the count/lists both read cardIrregularFeatures, only with the irregular setting on', () => {
    expect(src('components/Interval/MapCanvas.tsx')).toMatch(/hideSpan && layers \? cardIrregularRouteKeys\(cardIrregularFeatures\(layers, period\)\)/);
    expect(src('hooks/useIntervalStats.ts')).toMatch(/hideSpan && period \? cardIrregularFeatures\(layers, period\)/);
    expect(src('hooks/useIntervalStats.ts')).toContain('!cardIrregular?.has(p)');
  });

  it('All day hides nothing: the card has no period to read irregular in', () => {
    expect(cardIrregularFeatures({}, 'all').size).toBe(0);
    expect(cardIrregularRouteKeys(new Map())).toEqual([]);
  });
});
