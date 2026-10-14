import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const lines = async (name: string, slug: string, routeId: string, day: string) =>
  JSON.parse((await processGtfsBuffer(await fixtureZip(name), undefined, { slug })).geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.routeId === routeId && p.day === day && p.stopId == null);

describe('dedupe between drawings of the same line: the midday pattern holds the slot', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('Lethbridge 4 Saturday to Crossings: the midday shapes are not left out (#844)', async () => {
    // Real feed (20261231 archive), route 4 Saturday service only, shapes thinned to every 10th
    // point. Direction 1 runs Southgate to Crossings on one stop pattern but three shapes:
    // ca3f7b96 early morning and evening (median 33, no midday), ef45b356 09:54-11:33 and
    // bc1f9a37 12:06-17:56 (midday 35). The morning-and-evening shape won the slot on its
    // all-day median and the line read infrequent with a 339 minute midday gap. Hand count:
    // Southgate departures every 32-38 minutes 07:10-22:46.
    const saturday = await lines('lethbridge-4-saturday-shapes', 'lethbridge', '4', 'Saturday');
    const crossings = saturday.find((p: any) => p.directionId === 1);
    expect(crossings.tier).toBe('60');
    expect(crossings.headwayByPeriod.midday).toBe(33);
    expect(crossings.maxGapByPeriod.midday).toBeLessThan(60);
    // Direction 0 already pooled its three shapes and is unchanged.
    const lakeview = saturday.find((p: any) => p.directionId === 0);
    expect(lakeview.tier).toBe('60');
    expect(lakeview.headwayByPeriod.midday).toBe(33);
  });

  it('REM A3-A1 weekday to Anse-a-l\'Orme: the morning platform pattern keeps its periods (#842)', async () => {
    // Real feed (20261231 archive), route S3 weekday service only. Direction 0 runs on S30017
    // 05:30-14:29 (ends at QUAI_02) and S30008 14:43-24:06 (ends at QUAI_01): the same line to
    // a different terminal platform. The afternoon pattern (no midday) won the slot, so the AM
    // peak and midday read null and hours 5-13 had no headway.
    const weekday = await lines('rem-a3-weekday-platforms', 'rem', 'S3', 'Weekday');
    const anse = weekday.find((p: any) => p.directionId === 0);
    expect(anse.tier).toBe('15');
    expect(anse.headwayByPeriod.amPeak).toBe(14);
    expect(anse.headwayByPeriod.midday).toBe(15);
    expect(anse.headwayByHour['8']).not.toBeNull();
  });

  it('Brantford 3073 weekday: a variant to another terminal keeps its own slot', async () => {
    // Real feed, route 3073 weekday service 625. Direction 1 runs one pattern to Sinclair Blvd
    // (05:15-20:45, evening service) and one to Brantford Medical Centre (07:45-15:50), 203 m
    // apart: different terminals, so the midday rule does not swap them and the drawn pattern
    // keeps its evening.
    const weekday = await lines('brantford-3073-weekday-terminals', 'brantford', '3073', 'Weekday');
    const lynden = weekday.find((p: any) => p.directionId === 1);
    expect(lynden.headwayByPeriod.evening).toBe(30);
  });
});
