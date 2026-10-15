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
    // Four inside two hours (a school-time shuttle 11:00-12:50) is not midday service either:
    // the reading must spread over at least half of 9-15h (MIDDAY_READING_MIN_SPAN_MINUTES).
    expect(hasMiddayReading([660, 700, 740, 770])).toBe(false);
    expect(hasMiddayReading([600, 660, 720, 780])).toBe(true);
    // Just past the old 90-minute burst span is still a burst for midday purposes.
    expect(hasMiddayReading([720, 740, 760, 811])).toBe(false);
    // Departures outside 9-15h do not count (a peak-only pattern).
    expect(hasMiddayReading([360, 400, 440, 480, 960, 1000, 1040])).toBe(false);
    expect(hasMiddayReading(undefined)).toBe(false);
  });
});
