import { describe, expect, it } from 'vitest';
import { hasMiddayReading } from '../process-core';

// CIV-150: the test behind "limited" for a variant of a line with midday service elsewhere.
describe('hasMiddayReading', () => {
  it('needs four unique departures 9-15h spread past a burst', () => {
    expect(hasMiddayReading([540, 600, 660, 720])).toBe(true);
    // Three, or four with a duplicate: no reading.
    expect(hasMiddayReading([540, 600, 660])).toBe(false);
    expect(hasMiddayReading([540, 600, 600, 660])).toBe(false);
    // Four within 90 minutes is a burst (cta 82: PM short turns minutes apart).
    expect(hasMiddayReading([720, 740, 760, 800])).toBe(false);
    // Four over two hours counts: the patterns of a line that alternates two full-length
    // variants (SEPTA 40 Lombard / via Pine St) each hold their midday trips inside two hours.
    expect(hasMiddayReading([660, 700, 740, 770])).toBe(true);
    expect(hasMiddayReading([600, 660, 720, 780])).toBe(true);
    expect(hasMiddayReading([720, 740, 760, 811])).toBe(true);
    // Departures outside 9-15h do not count (a peak-only pattern).
    expect(hasMiddayReading([360, 400, 440, 480, 960, 1000, 1040])).toBe(false);
    expect(hasMiddayReading(undefined)).toBe(false);
  });
});
