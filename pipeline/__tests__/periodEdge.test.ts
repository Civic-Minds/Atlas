import { describe, expect, it } from 'vitest';
import { periodEdge } from '../tripSets';

// #934: SF Muni 8BX AM at Bryant St & 5th St (13724), the oracle's departures (6:00-9:00).
const BX_AM = [437, 445, 455, 463, 473, 481, 491, 499, 510, 518, 527, 537];

describe('periodEdge (#934)', () => {
  it('a late start around steady service: from the first departure, every the median gap', () => {
    expect(periodEdge(BX_AM, 360, 540, 77)).toEqual({ from: 437, every: 9 });
  });
  it('an early end: until the last departure', () => {
    const t = Array.from({ length: 10 }, (_, i) => 900 + i * 10); // 15:00-16:30, then nothing to 19:00
    expect(periodEdge(t, 900, 1140, 150)).toEqual({ until: 990, every: 10 });
  });
  it('none when the value is not the edge gap (a tail or another stretch sets it)', () => {
    expect(periodEdge(BX_AM, 360, 540, 80)).toBeNull();
  });
  it('none when an inner gap sets the value', () => {
    expect(periodEdge([360, 370, 380, 460, 470, 480, 490, 500, 510, 520, 530, 540], 360, 540, 80)).toBeNull();
  });
  it('none when the inner gaps are not steady (a 30 among 8s)', () => {
    const t = [437, 445, 453, 483, 491, 499, 507, 515, 523, 531];
    expect(periodEdge(t, 360, 540, 77)).toBeNull();
  });
  it('none at 60 or less: a short start gap already reads as a plain spacing', () => {
    expect(periodEdge([372, 382, 392, 402, 412, 422, 432, 442, 452, 462, 472, 482, 492, 502, 512, 522, 532], 360, 540, 12)).toBeNull();
  });
  it('none with fewer than 3 departures', () => {
    expect(periodEdge([437, 445], 360, 540, 95)).toBeNull();
  });
});
