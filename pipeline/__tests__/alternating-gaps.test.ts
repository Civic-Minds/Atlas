import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { medianHeadwayInWindow, resolveTerminalHeadline, sustainedMedianHeadwayInWindow, typicalOfGaps } from '../headway-utils';
import { pooledStopMetrics } from '../sharedStretch';
import { computeHeadwayStats } from '../transit-phase2';
import { processGtfsBuffer } from '../process-core';

const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });

// #772: the median of alternating short and long gaps lands on the short gap.
describe('typical wait for alternating gaps', () => {
  it('reads the mean when a third or more of the gaps are long (60/120 alternation)', () => {
    expect(typicalOfGaps([60, 120, 60])).toBe(80);
    // 30/90 alternation: the 90s take 60% of the time, so most riders wait a 90 gap.
    expect(typicalOfGaps([30, 90, 30, 30, 90, 30])).toBe(90);
    // 6/12 pairs (ttc 100A to Pape, PM): the 12s are not holes; a rider sees the mean, 9.
    expect(typicalOfGaps([6, 12, 6, 12, 6, 12, 6, 12, 6])).toBe(Math.max(6, 78 / 9));
    expect(Math.round(typicalOfGaps([6, 12, 6, 12, 6, 12, 6, 12, 6]))).toBe(9);
    expect(medianHeadwayInWindow(at('9:27', '10:27', '12:27', '13:27', '15:27'), 540, 960, 3, true)).toBe(90);
    // Without `typical` (pooled shared-stretch values) the plain median stands.
    expect(medianHeadwayInWindow(at('9:27', '10:27', '12:27', '13:27'), 540, 960, 3)).toBe(60);
  });

  it('keeps the median for regular service with one odd gap', () => {
    expect(typicalOfGaps([10, 10, 30, 10, 10])).toBe(10);
    expect(medianHeadwayInWindow(at('9:00', '9:15', '9:30', '9:45', '10:00', '10:30', '10:45', '11:00'), 540, 900, 3, true)).toBe(15);
  });

  it('keeps the median for one or two gaps, uneven but steady service, and outlier gaps', () => {
    expect(typicalOfGaps([10, 30])).toBe(20);
    expect(typicalOfGaps([11, 12, 13, 12, 12, 11, 13])).toBe(12);
    // A slower start, then steady service, is not alternation (sbmtd 12X midday).
    expect(typicalOfGaps([70, 70, 35, 35, 35, 35, 35])).toBe(35);
    // A night route's daytime hole and a paired trip's long half are outliers, not alternation.
    expect(typicalOfGaps([30, 30, 30, 1080])).toBe(30);
    expect(typicalOfGaps([2, 58, 2, 58, 2])).toBe(2);
  });

  it('reads the long gaps when they take up most of the time (a block, not an alternation)', () => {
    expect(typicalOfGaps([30, 30, 60, 60, 60, 30, 30])).toBe(60);
    // Too few gaps to call a block: the mean, not the one long gap.
    expect(Math.round(typicalOfGaps([120, 285, 115]))).toBe(173);
  });

  it('keeps the median for three gaps with a break at least 3x the median (#834)', () => {
    expect(typicalOfGaps([70, 350, 70])).toBe(70);
    expect(typicalOfGaps([30, 90, 30])).toBe(30);
    expect(typicalOfGaps([150, 450, 150])).toBe(150);
    expect(typicalOfGaps([80, 460, 100])).toBe(100);
    // Under 3x it is still an alternation and reads the mean.
    expect(typicalOfGaps([60, 120, 60])).toBe(80);
    expect(Math.round(typicalOfGaps([120, 285, 115]))).toBe(173);
    // Four or more gaps keep the existing rule.
    expect(typicalOfGaps([30, 90, 30, 30, 90, 30])).toBe(90);
  });

  it('counts a gap as long from 1.5x the median, and as an outlier above 5x', () => {
    // 30 is exactly 1.5x the median 20: long, so the gaps alternate and read their mean.
    expect(typicalOfGaps([20, 30, 20, 30, 20, 30, 20])).toBe(170 / 7);
    expect(typicalOfGaps([20, 29, 20, 29, 20, 29, 20])).toBe(20);
    // 100 is exactly 5x the median 20: still counted; 101 is an outlier and left out.
    expect(typicalOfGaps([20, 100, 20, 20, 100, 20])).toBe(100);
    expect(typicalOfGaps([20, 101, 20, 20, 101, 20])).toBe(20);
  });

  it('pooled shared-stretch values keep the plain median', () => {
    // Midday 30, 30, 60, 60, 60, 30, 30: the typical reading is 60; pooling keeps max(median 30,
    // mean gap 43), as before #772.
    const pooled = pooledStopMetrics(at('9:00', '9:30', '10:00', '11:00', '12:00', '13:00', '13:30', '14:00'));
    expect(typicalOfGaps([30, 30, 60, 60, 60, 30, 30])).toBe(60);
    expect(pooled.headway).toBe(43);
    expect(pooled.byPeriod.midday).toBe(43);
  });

  it('Saint John 12: the all-day phase 2 value is no longer the short 60', () => {
    expect(computeHeadwayStats(at('7:30', '8:30', '9:30', '13:15', '17:30', '18:30')).median).toBe(240);
  });

  it('leaves the dominant-gap guard of the all-day fallback unchanged', () => {
    expect(sustainedMedianHeadwayInWindow(at('6:20', '6:30', '6:40', '6:50', '14:30'), 360, 1320, 3)).toBeNull();
  });
});

// Step 4 decides branch protection on plain medians; the typical value only raises the result.
describe('terminal headline with branch protection (#772)', () => {
  it('a typical terminal value cannot drop branch protection', () => {
    // Terminal 30, 30, 60, 60, 30, 30 (plain 30, typical 40) against trunk stops at 60: the
    // plain ratio 2.0 keeps the branch value 60. On typical values (ratio 1.5) it would read 40.
    expect(resolveTerminalHeadline(30, [60, 60, 60], 40, 60, 12)).toBe(60);
    expect(resolveTerminalHeadline(40, [60, 60, 60], 40, 60, 12)).toBe(40);
  });

  it('the typical value never reads slower than the headsign pooled at the terminal', () => {
    // ttc 96B's drawn shape: 9 early trips, gaps 12, 12, 12, 27, 24, 6 read 26; the headsign's
    // trips on every shape reach York Mills every 17 midday.
    expect(resolveTerminalHeadline(12, [12, 12], 26, 15, 9, 17)).toBe(17);
    // The cap never goes below the plain value.
    expect(resolveTerminalHeadline(12, [12, 12], 26, 15, 9, 8)).toBe(12);
  });

  it('without a branch to protect, the typical terminal value raises the headline', () => {
    expect(resolveTerminalHeadline(30, [30, 30, 30], 40, 30, 12)).toBe(40);
    // Regular service: plain and typical agree, nothing changes.
    expect(resolveTerminalHeadline(15, [15, 15], 15, 15, 40)).toBe(15);
  });
});

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function headlines(name: string, slug: string, day: string): Promise<Record<string, number>> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return Object.fromEntries(JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.day === day && p.stopId == null && p.headway != null)
    .map((p: any) => [`${p.directionId} ${p.headsign}`, p.headway]));
}

describe('real routes with alternating gaps (#772)', () => {
  it('Basin Transit 1 Saturday: 60/120 alternation reads 80, not 60', async () => {
    // Real Basin Transit feed (UTC 11-Jul-2026), route 1, Saturday 2026-10-17 services. Stop
    // 11858 toward 29 Palms: 9:27 10:27 12:27 13:27 15:27 16:27 18:27 21:18, midday gaps 60, 120,
    // 60. The mirrored direction already read 90 from its PM peak and is unchanged.
    expect(await headlines('basin-1-alternating', 'basin-transit', 'Saturday')).toEqual({
      '0 29 Palms Marine Base': 80,
      '1 Yucca Valley': 90,
    });
  });

  it('Saint John 12 Weekday: mirrored 6-trip timetables read the 4-hour midday gaps, not 143 and 60', async () => {
    // Real Saint John feed (a5193e57), route 12, Wed 2026-10-14. Both directions run 6 trips,
    // gaps 60, 60, 225, 255, 60: the long gaps take most of the day. Before: 143 (a
    // 5-departure stop sample) and 60 (the median of the six), 2.4x apart.
    expect(await headlines('saint-john-12-mirrored', 'saint-john', 'Weekday')).toEqual({
      '0 River Valley Community Centre': 240,
      '1 Lancaster Mall': 243,
    });
  });

  it('MATA 42 Sunday: Woodrow 30, 30, 60, 60, 30, 30 reads 40, the mean wait', async () => {
    // Real MATA feed (2026-10-12 to 11-10), route 42, Sunday service 3-Sun. Toward Frayser at
    // Woodrow: 10:07 10:37 11:07 12:07 13:07 13:37 14:07 15:07, midday gaps 30, 30, 60, 60, 30,
    // 30. The long gaps take half the time, not most of it, so the mean (40) stands.
    expect(await headlines('mata-42-sunday', 'mata', 'Sunday')).toEqual({
      '0 AIRWAYS TRANSIT': 60,
      '1 FRAYSER at WOODROW': 40,
    });
  });

  it('Brampton 1 Weekday: dedupe on the plain median keeps the shape with late and overnight service', async () => {
    // Real Brampton feed (2026-09-08 to 10-30), route 1 Queen West, service
    // 260907-MULTI-Weekday-03. Comparing typical headways in dedupe swapped the drawn shape to
    // one with no late or overnight trips (midday 38, late and overnight null).
    const result = await processGtfsBuffer(await fixtureZip('brampton-1-weekday'), undefined, { slug: 'brampton' });
    const queenWest = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .find((p: any) => p.day === 'Weekday' && p.stopId == null && p.headsign === 'QUEEN WEST');
    expect(queenWest.headwayByPeriod).toMatchObject({ midday: 25, late: 34, overnight: 29 });
  });

  it('TTC 96B Weekday: a thin early-morning shape that won dedupe reads the headsign at York Mills, 17', async () => {
    // Real TTC feed (2026-09-06 to 10-31), route 96 eastbound, weekday service 1. 96B via Martin
    // Grove is drawn on shape 1123480 (9 trips, 6:18-7:51), whose terminal gaps 12, 12, 12, 27,
    // 24, 6 read 26 typical and 12 plain; the headsign's 79 trips reach York Mills every 12 to
    // 17 (midday 17).
    expect((await headlines('ttc-96-weekday-east', 'ttc', 'Weekday'))['0 York Mills via Martin Grove and Westhumber']).toBe(17);
  });

  it('MATA 42 Weekday: a 60-min midday core between 30-min shoulders keeps its headline of 60', async () => {
    // Real MATA feed, route 42, Wed 2026-10-14. Toward Frayser at Woodrow the terminal sees
    // 9:31 10:01 10:31 11:31 12:31 13:31 14:01 14:31 (gaps 30, 30, 60, 60, 60, 30, 30) and the
    // other stops every 60. A plain mean (43) read better service than exists.
    expect((await headlines('mata-42-weekday', 'mata', 'Weekday'))['1 FRAYSER at WOODROW']).toBe(60);
  });
});
