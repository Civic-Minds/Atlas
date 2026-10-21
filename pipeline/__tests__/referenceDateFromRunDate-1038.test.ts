import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #1038: the detected reference date skips a weekday service that runs today, so these
// routes were published Saturday only. Humboldt's four services start on different dates,
// so the median start (Nov 23) lands in Thanksgiving break, when the fall weekday service
// is removed. GPTC's weekday service 91161 is alone in its start group, so the reference
// came out in Aug 2024, before it began. Both agencies read the feed as of the run date.
// Fixtures: the real feeds' calendar files unchanged, a few routes, each trip's first and
// last stop.
const FIXTURES = resolve(__dirname, 'fixtures');
const CONFIG = resolve(__dirname, '../../config/agencies');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function lines(fixture: string, slug: string, options: { referenceDateFromRunDate?: boolean }) {
  const result = await processGtfsBuffer(await fixtureZip(fixture), undefined, { slug, ...options });
  return JSON.parse(result.geojson).features
    .map((f: any) => f.properties)
    .filter((p: any) => p.stopId == null);
}

const has = (features: any[], route: string, day: string) =>
  features.some((p: any) => p.routeShortName === route && p.day === day);
const headway = (features: any[], route: string, day: string) =>
  features.find((p: any) => p.routeShortName === route && p.day === day)?.headway;

describe('referenceDateFromRunDate for Humboldt and GPTC (#1038)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('both agencies opt in', () => {
    for (const slug of ['humboldt', 'gptc']) {
      const config = JSON.parse(readFileSync(resolve(CONFIG, `${slug}.json`), 'utf8'));
      expect(config.referenceDateFromRunDate).toBe(true);
    }
  });

  describe('Humboldt', () => {
    it('without the opt-in, the fall weekday routes are missing', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
      const features = await lines('humboldt-cph-semester', 'humboldt', {});
      expect(has(features, 'HHM', 'Weekday')).toBe(false);
      expect(has(features, 'A Orng', 'Weekday')).toBe(false);
    });

    it('reads the fall timetable during the semester', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
      const features = await lines('humboldt-cph-semester', 'humboldt', { referenceDateFromRunDate: true });
      // HHM Express runs every 12 minutes 07:00-15:48 on WkDy CPH Group.
      expect(headway(features, 'HHM', 'Weekday')).toBe(12);
      // A Orng runs three evening trips on weekdays and hourly on Saturdays.
      expect(has(features, 'A Orng', 'Weekday')).toBe(true);
      expect(headway(features, 'A Orng', 'Saturday')).toBe(60);
    });

    it('reads the regular timetable after the fall service ends', async () => {
      // WkDy CPH Group ends Dec 18; WkDy Reg (no HHM, no weekday A Orng) runs in January.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-01-13T12:00:00') });
      const features = await lines('humboldt-cph-semester', 'humboldt', { referenceDateFromRunDate: true });
      expect(has(features, 'HHM', 'Weekday')).toBe(false);
      expect(has(features, 'A Orng', 'Weekday')).toBe(false);
      expect(headway(features, 'A Orng', 'Saturday')).toBe(60);
    });
  });

  describe('GPTC', () => {
    it('without the opt-in, only L2 has weekday service', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
      const features = await lines('gptc-91161-weekday', 'gptc', {});
      expect(has(features, 'L1', 'Weekday')).toBe(false);
      expect(has(features, 'R2', 'Weekday')).toBe(false);
      expect(has(features, 'L2', 'Weekday')).toBe(true);
    });

    it('reads the running weekday service', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
      const features = await lines('gptc-91161-weekday', 'gptc', { referenceDateFromRunDate: true });
      // L1 every 30 and R2 hourly on 91161, Mon-Fri 2026-04-27 to 2027-01-23.
      expect(headway(features, 'L1', 'Weekday')).toBe(30);
      expect(headway(features, 'R2', 'Weekday')).toBe(60);
    });

    it('leaves L2 and Saturday service as they were', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') });
      const before = await lines('gptc-91161-weekday', 'gptc', {});
      const after = await lines('gptc-91161-weekday', 'gptc', { referenceDateFromRunDate: true });
      const pick = (features: any[]) => features
        .filter((p: any) => p.routeShortName === 'L2' || p.day === 'Saturday')
        .map((p: any) => [p.routeShortName, p.directionId, p.day, p.tier, p.headway])
        .sort();
      expect(pick(after)).toEqual(pick(before));
      expect(pick(after).length).toBeGreaterThan(0);
    });
  });
});
