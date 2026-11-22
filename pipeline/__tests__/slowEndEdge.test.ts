import { afterEach, describe, expect, it, vi } from 'vitest';
import { periodEdge, slowEndEdge } from '../tripSets';

// CIV-1913 (Ryan: "We already have wording for this"): a period that runs steadily and then slows down reads
// "every N until <time>, then every M" with the CIV-1241 "until" words. slowStartEdge's tests mirrored; on unless
// ATLAS_SLOW_END_UNTIL=0.
const EVENING = { start: 19 * 60, end: 23 * 60 };
const every = (step: number, from: number, to: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// Kingston 701 weekday evening, main stretch: every 15 from 7:00 to 8:45 PM, then every 30 to 10:45.
const kingston701 = [...every(15, 1140, 1245), ...every(30, 1275, 1365)];

afterEach(() => vi.unstubAllEnvs());

describe('slow end: "every N until <time>, then every M" (CIV-1913)', () => {
  it('Kingston 701 evening reads every 15 until 8:45 PM, then every 30 (its value)', () => {
    expect(slowEndEdge(kingston701, EVENING.start, EVENING.end, 30)).toEqual({ until: 1245, every: 15, then: 30 });
  });

  it('names the last departure the faster service holds to, not an earlier one', () => {
    const edge = slowEndEdge(kingston701, EVENING.start, EVENING.end, 30);
    expect(edge?.until).toBe(Math.max(...kingston701.filter(x => x <= 1245)));
  });

  it('finds the change when the slower service is most of the period (CapMetro 300: every 15 to 7:54 PM, then every 30)', () => {
    const capmetro300 = [1140, 1155, 1170, 1185, 1194, ...every(30, 1224, 1374)];
    expect(slowEndEdge(capmetro300, EVENING.start, EVENING.end, 30)).toEqual({ until: 1194, every: 15, then: 30 });
  });

  it('reads a value set by a gap after the time, not by the wait to the period end (CapMetro 300 southbound)', () => {
    const sb = [1147, 1162, 1177, 1192, ...every(30, 1222, 1342)];
    expect(slowEndEdge(sb, EVENING.start, EVENING.end, 30)).toEqual({ until: 1192, every: 15, then: 30 });
  });

  it('one hole in steady service is not a slow end: it keeps the one-gap reading', () => {
    const oneHole = [...every(15, 1140, 1260), ...every(15, 1290, 1365)];
    expect(slowEndEdge(oneHole, EVENING.start, EVENING.end, 30)).toBeNull();
  });

  it('needs four steady departures from the period start', () => {
    const short = [1140, 1155, 1170, ...every(30, 1200, 1365)];
    expect(slowEndEdge(short, EVENING.start, EVENING.end, 30)).toBeNull();
  });

  it('a slow start before the steady run is not a slow end', () => {
    const lateStart = [1170, 1200, ...every(15, 1215, 1365)];
    expect(slowEndEdge(lateStart, EVENING.start, EVENING.end, 30)).toBeNull();
  });

  it('only when the slow part sets the value', () => {
    expect(slowEndEdge(kingston701, EVENING.start, EVENING.end, 45)).toBeNull();
  });

  it('is on unless switched off, and periodEdge reads it', () => {
    expect(periodEdge(kingston701, EVENING.start, EVENING.end, 30)).toEqual({ until: 1245, every: 15, then: 30 });
    vi.stubEnv('ATLAS_SLOW_END_UNTIL', '0');
    expect(periodEdge(kingston701, EVENING.start, EVENING.end, 30)).toBeNull();
  });
});

describe('slow end where service ends (CIV-1913 sample check)', () => {
  // BART Grey toward Coliseum, weekday late (23:00-02:00): every 6-7 to 23:51, then 0:11, 0:26, 0:59 and no more trains.
  const bartGrey = [1381, 1387, 1394, 1400, 1406, 1412, 1418, 1425, 1431, 1451, 1466, 1499];
  it('no "then" reading when the value is the wait after the last trip of the day', () => {
    expect(slowEndEdge(bartGrey, 1380, 1560, 61, false)).toBeNull();
  });
});

describe('slow end needs a later cadence (CIV-1913 sample check)', () => {
  // CyRide weekday midday (9:00-15:00): every 15 to 9:45, then one bus at 14:30.
  const cyride = [540, 555, 570, 585, 870];
  it('one trip after a long hole is not "then every 285"', () => {
    expect(slowEndEdge(cyride, 540, 900, 285)).toBeNull();
  });
  // London evening (19:00-23:00): every 10-12 to 21:01, then 21:39 and 22:20.
  const london = [1141, 1152, 1163, 1173, 1181, 1191, 1203, 1213, 1221, 1231, 1243, 1251, 1261, 1299, 1340];
  it('two later trips still read as a slower cadence', () => {
    expect(slowEndEdge(london, 1140, 1380, 41)).toEqual({ until: 1261, every: 12, then: 41 });
  });
});
