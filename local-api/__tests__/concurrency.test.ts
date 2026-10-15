import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../concurrency.js';

describe('mapWithConcurrency', () => {
  it('keeps async work within the configured limit and preserves order', async () => {
    let active = 0;
    let peak = 0;

    const result = await mapWithConcurrency(
      Array.from({ length: 40 }, (_, index) => index),
      15,
      async value => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active -= 1;
        return value * 2;
      },
    );

    expect(peak).toBe(15);
    expect(result).toEqual(Array.from({ length: 40 }, (_, index) => index * 2));
  });

  it('rejects an invalid concurrency limit', async () => {
    await expect(mapWithConcurrency([1], 0, async value => value)).rejects.toThrow(
      'Concurrency must be a positive integer.',
    );
  });
});
