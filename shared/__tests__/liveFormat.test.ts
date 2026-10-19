import { describe, expect, it } from 'vitest';
import { minutesText, tenth } from '../liveFormat';

describe('minute figures', () => {
  it('round to a tenth of a minute everywhere, whole numbers without .0', () => {
    expect(minutesText(0.9)).toBe('0.9 min');
    expect(minutesText(0.96)).toBe('1 min');
    expect(minutesText(2.14)).toBe('2.1 min');
    expect(tenth(-1.25)).toBe('−1.2');
  });
});
