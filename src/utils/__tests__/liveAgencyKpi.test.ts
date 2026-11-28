import { describe, expect, it } from 'vitest';
import { shownShareArrow } from '../liveAgencyKpi';

// #1925: the All routes "Trip time vs schedule" arrow follows the share as written, never the signed value behind it.
describe('shownShareArrow', () => {
  it('points down when "5% faster" becomes "4% faster" (the number shown went down)', () => {
    expect(shownShareArrow(-0.04, -0.05)).toBe('down');
    expect(shownShareArrow(-0.07, -0.05)).toBe('up');
  });
  it('follows the number on the slower side too', () => {
    expect(shownShareArrow(0.06, 0.03)).toBe('up');
    expect(shownShareArrow(0.02, 0.03)).toBe('down');
  });
  it('gives no arrow across faster and slower, or when the shown numbers match', () => {
    expect(shownShareArrow(0.02, -0.03)).toBe('none');
    expect(shownShareArrow(-0.041, -0.044)).toBe('none');
  });
  it('treats "on time" as zero', () => {
    expect(shownShareArrow(0, -0.05)).toBe('down');
    expect(shownShareArrow(0.03, 0.001)).toBe('up');
  });
});
