import { describe, expect, it } from 'vitest';
import { countText, decimalText, percentTenthText, percentText, signedPercentText } from '../numberText';

// CIV-1587: the one number format (docs/style/TEXT.md "Numbers").
describe('counts', () => {
  it('a comma every three digits, whole numbers, a real minus sign, never "−0"', () => {
    expect(countText(1234567)).toBe('1,234,567');
    expect(countText(12)).toBe('12');
    expect(countText(0)).toBe('0');
    expect(countText(-0.2)).toBe('0');
    expect(countText(-1500)).toBe('−1,500');
    expect(countText(2.6)).toBe('3');
  });
});

describe('decimals', () => {
  it('a fixed number of decimals, keeping the trailing zero', () => {
    expect(decimalText(5, 1)).toBe('5.0');
    expect(decimalText(9.94, 1)).toBe('9.9');
    expect(decimalText(-1.25, 1)).toBe('−1.3');
  });
});

describe('whole percents', () => {
  it('a share as a whole percent', () => {
    expect(percentText(0.123)).toBe('12%');
    expect(percentText(0)).toBe('0%');
    expect(percentText(1)).toBe('100%');
    expect(percentText(0.005)).toBe('1%');
  });
});

describe('signed shares', () => {
  it('sign the change as shown, so one that rounds to 0 reads "0%", not "−0%"', () => {
    expect(signedPercentText(0.12)).toBe('+12%');
    expect(signedPercentText(-0.04)).toBe('−4%');
    expect(signedPercentText(-0.004)).toBe('0%');
    expect(signedPercentText(0.004)).toBe('0%');
  });
});

describe('delivered share', () => {
  it('rounds down to a tenth of a percent, so missed trips never read 100%', () => {
    expect(percentTenthText(0.9996)).toBe('99.9%');
    expect(percentTenthText(1)).toBe('100%');
    expect(percentTenthText(0.57)).toBe('57.0%');
    // Last week's 99.06% beside this week's 99.4%: the same one decimal (#1472).
    expect(percentTenthText(0.9906)).toBe('99.0%');
    expect(percentTenthText(0.9667)).toBe('96.6%');
  });
});
