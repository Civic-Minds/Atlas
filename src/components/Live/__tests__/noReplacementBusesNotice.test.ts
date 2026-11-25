import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as copy from '../../../content/noticeCopy';

// #1803 (Ryan, 2026-11-24): "Why the fuck does it say 'Replacement buses: all figures describe the buses running this
// route' i didnt approve this notice here". Neither the Live route card nor its Details says it.
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('no replacement-buses notice on Live (#1803)', () => {
  it('is gone from the shared copy', () => {
    expect(Object.keys(copy)).not.toContain('LIVE_REPLACEMENT_BUSES');
  });

  it('the route card and Details never show it', () => {
    for (const file of ['LiveRoutePerformance.tsx', 'sections/MethodSection.tsx']) {
      expect(read(file), file).not.toMatch(/replacement bus/i);
    }
  });
});
