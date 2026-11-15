import { afterEach, describe, expect, it, vi } from 'vitest';
import { periodEdge, slowStartEdge } from '../tripSets';

// CIV-1411 (Ryan, 2026-11-13): a period that starts slowly reads "every N from <time>" on the card, as a
// period with no service before that time already does (#1277, #934). N is the longest wait from that time
// on, rounded up, so it never reads better than the service runs. On unless ATLAS_SLOW_START_FROM=0.
const AM = { start: 360, end: 540 };
const every = (step: number, from: number, to: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// TTC Line 5 westbound at Laird (feed S1000544, Wednesday 2026-11-18): 6:06, 6:26, 6:46, every 8.5 to 7:28, then every 3.6.
const line5 = [366, 386, 406, ...every(8.5, 414, 440), ...every(3.6, 448.2, 539)];
// Hamilton 51 inbound: every 20 until 7:54, then every 10, then 7-9: slow for more than half the period.
const hamilton51 = [...every(20, 375.4, 474), ...every(10, 484, 504), ...every(8, 512, 539)];

afterEach(() => vi.unstubAllEnvs());

describe('slow start: "every N from <time>" (CIV-1411)', () => {
  it('Line 5 AM reads every 4 from 7:28 (longest wait 3.6), its value (20) set by the slow start', () => {
    const edge = slowStartEdge(line5, AM.start, AM.end, 20);
    expect(edge?.from).toBeCloseTo(448.2, 1);
    expect(edge?.every).toBe(4);
  });

  it('a steady run that slows again later in the period is not a slow start (LA Metro 165: every 8 from 7:04, every 15 from 8:17)', () => {
    const la165 = [369, 393, 408, 424, ...every(8, 432, 497), ...every(15, 512, 539)];
    expect(slowStartEdge(la165, AM.start, AM.end, 24)).toBeNull();
  });

  it('reads the whole-minute stop times the pipeline keeps (Line 5: 7:19 to 7:27 is 8, a slow gap against 4)', () => {
    const minutes = [366, 386, 406, 413, 422, 430, 439, 447, 452, 456, ...every(3.6, 459.9, 539).map(Math.floor)];
    // The longest wait from 7:27 is 7:27 to 7:32: every 5, not the typical 4.
    expect(slowStartEdge(minutes, AM.start, AM.end, 20)).toEqual({ from: 447, every: 5 });
  });

  it('names the longest wait from that time on, not the typical gap (Halifax 1: every 10-15 from 6:30)', () => {
    const halifax1 = [360, 390, ...every(15, 390 + 15, 435), ...every(10, 443, 539)];
    expect(slowStartEdge(halifax1, AM.start, AM.end, 30)).toEqual({ from: 390, every: 15 });
  });

  it('is on unless switched off, and periodEdge reads it', () => {
    expect(periodEdge(line5, AM.start, AM.end, 20)?.from).toBeCloseTo(448.2, 1);
    vi.stubEnv('ATLAS_SLOW_START_FROM', '0');
    expect(periodEdge(line5, AM.start, AM.end, 20)).toBeNull();
  });

  it('a start that stays slow past the period midpoint keeps its plain longest wait (Hamilton 51)', () => {
    expect(slowStartEdge(hamilton51, AM.start, AM.end, 20)).toBeNull();
  });

  it('a hole after the steady run starts, or an early end, is not a slow start', () => {
    const hole = [366, 386, ...every(4, 406, 470), ...every(4, 495, 539)];
    expect(slowStartEdge(hole, AM.start, AM.end, 25)).toBeNull();
    const earlyEnd = [366, 386, ...every(4, 406, 500)];
    expect(slowStartEdge(earlyEnd, AM.start, AM.end, 40)).toBeNull();
  });

  it('a single hole in service that already ran at the steady pace is not a slow start', () => {
    const hole = [...every(10, 540, 630), ...every(10, 675, 895)];
    expect(slowStartEdge(hole, 540, 900, 45)).toBeNull();
  });

  it('the value must come from the slow start, and be over twice the steady gap', () => {
    expect(slowStartEdge(line5, AM.start, AM.end, 30)).toBeNull();
    const mild = [...every(7, 360, 400), ...every(5, 405, 539)];
    expect(slowStartEdge(mild, AM.start, AM.end, 7)).toBeNull();
  });

  it('a late start keeps the existing #934 reading', () => {
    expect(periodEdge(every(9, 437, 539), AM.start, AM.end, 77)).toEqual({ from: 437, every: 9 });
  });
});
