import { describe, expect, it } from 'vitest';
import { minutesText, pctTenth, signedPct, tenth } from '../liveFormat';

describe('minute figures', () => {
  it('round to a tenth of a minute everywhere, whole numbers without .0', () => {
    expect(minutesText(0.9)).toBe('0.9 min');
    expect(minutesText(0.96)).toBe('1 min');
    expect(minutesText(2.14)).toBe('2.1 min');
    expect(tenth(-1.25)).toBe('−1.2');
  });
});

describe('signed shares', () => {
  it('sign the change as shown, so one that rounds to 0 reads "0%", not "−0%"', () => {
    expect(signedPct(0.12)).toBe('+12%');
    expect(signedPct(-0.04)).toBe('−4%');
    expect(signedPct(-0.004)).toBe('0%');
    expect(signedPct(0.004)).toBe('0%');
  });
});

describe('delivered share', () => {
  it('rounds down to a tenth of a percent, so missed trips never read 100%', () => {
    expect(pctTenth(0.9996)).toBe('99.9%');
    expect(pctTenth(1)).toBe('100%');
    expect(pctTenth(0.57)).toBe('57.0%');
    // Last week's 99.06% beside this week's 99.4%: the same one decimal (#1472).
    expect(pctTenth(0.9906)).toBe('99.0%');
    expect(pctTenth(0.9667)).toBe('96.6%');
  });
});
