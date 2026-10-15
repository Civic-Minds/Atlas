import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function lines(name: string, slug: string, day: string): Promise<Record<string, { headway: number | null; tier: string; midday: number | null }>> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return Object.fromEntries(JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.day === day && p.stopId == null)
    .map((p: any) => [`${p.directionId} ${p.headsign}`, { headway: p.headway, tier: p.tier, midday: p.headwayByPeriod?.midday ?? null }]));
}

// Real feeds, one route and one day type each, shapes thinned to every 10th point. Each value is
// a hand count of departures at the drawn stops from stop_times (CIV-150, 2026-10-13).
describe('pooled headline on real feeds (#690, #771, #813)', () => {
  it('ttc 41 Saturday via Keelesdale: every 8 at every stop reads 8, not the mean-floored 10', async () => {
    // Shape 1122752, 106 trips 06:05-25:26; 37-42 midday departures at every drawn stop,
    // median gap 8, longest 16. The headsign pool adds five pre-dawn and late trips, none 9-15h.
    const l = await lines('ttc-41-saturday-pooled', 'ttc', 'Saturday');
    expect(l['0 Keele Station via Keelesdale']).toMatchObject({ headway: 8, midday: 8 });
  });

  it('ttc 129 weekday Steeles via STC: a pool with a midday hole leaves the own midday 20, not its all-day 28', async () => {
    // Shape 1122030, 72 trips; 22 midday departures every 20 at every stop. The pool's merged
    // midday list has a 30-minute hole, so it is not read there.
    const l = await lines('ttc-129-weekday-pool-hole', 'ttc', 'Weekday');
    expect(l['1 Steeles via Scarborough Centre Stn']).toMatchObject({ headway: 20, midday: 20 });
  });

  it('ttc 38 weekday Kennedy via STC: the branch every 15 stands against the shared terminal every 7', async () => {
    // Two patterns share the headsign: 81 trips from Rouge Hill (40 stops, every 15 at the
    // origin, 25 midday departures) and a 22-stop short turn; together every 7 at Kennedy. The
    // #772 plain comparison reads the own pattern at the pooled terminal, so the branch's 15
    // holds (the combined 7 read before the fix).
    const l = await lines('ttc-38-weekday-short-turn', 'ttc', 'Weekday');
    expect(l['1 Kennedy via Scarborough Centre Stn'].headway).toBe(15);
  });

  it('septa 93 Sunday to Norristown: every 61-62 at every stop reads 62', async () => {
    // 11 trips 09:37-20:31 on shape 315633; four midday departures, gaps 116, 60, 62 at the
    // terminal and 61 along the line. 79 before the fix (the merged-list mean floor on a pool
    // that added nothing in the window).
    const l = await lines('septa-93-sunday', 'septa', 'Sunday');
    expect(l['1 Norristown Transit Center'].headway).toBe(62);
  });

  it('septa 114 weekday to Wawa: a two-hourly line reads 120, not 81', async () => {
    // 11 trips 06:15-20:55; four midday departures at the terminal, gaps 62, 122, 59
    // (typicalOfGaps 81), while every other drawn stop reads 120-121. The #772 branch rule keeps
    // the branch's 120; 81 before the fix came from the pooled terminal's floored reading.
    const l = await lines('septa-114-weekday', 'septa', 'Weekday');
    expect(l['0 Wawa Station']).toMatchObject({ headway: 120, tier: 'infrequent' });
  });
});

// CIV-150: a variant of a line with midday service elsewhere is limited. Its own terminal has
// no midday reading (four unique departures 9-15h spread past a burst) while another pattern
// of the same route, direction and day has one. A line with no such sibling keeps its reading:
// a route every two hours all day (septa 114 to Wawa) or a peak-only line on its own.
describe('midday variants of a line with midday service (CIV-150)', () => {
  it('septa 114 weekday: the peak-only 95 Industrial Park and six-trip Penn State variants are limited beside Wawa', async () => {
    // 95 Industrial Park: 05:21 06:31 07:37 08:33 16:35 17:33 at its terminal (read 60 before).
    // Penn State: 06:37 08:37 11:30 14:32 16:43 20:12, two midday departures (read 173 before).
    // Wawa Station runs every two hours all day and is the sibling with the midday reading.
    const l = await lines('septa-114-weekday', 'septa', 'Weekday');
    expect(l['0 95 Industrial Park'].headway).toBeNull();
    expect(l['0 Penn State'].headway).toBeNull();
    expect(l['0 Wawa Station'].headway).toBe(120);
    expect(l['0 Chester Transit Center'].headway).toBe(33);
  });

  it('ttc 86 Saturday: the all-day Kennedy shape draws the slot, not the morning-and-evening one (#877)', async () => {
    // Westbound to Kennedy runs on three shapes: 69 trips all day (37 midday departures), 41
    // trips with 18 at midday, and 58 trips with nothing between 09:00 and 19:00 (every 8 at
    // its terminal). The 58-trip shape held the slot on headway, had no own stop value, and
    // the direction read limited with no midday value while riders get a bus every 10 all day.
    const l = await lines('ttc-86-saturday', 'ttc', 'Saturday');
    expect(l['1 Kennedy'].headway).toBe(10);
    expect(l['1 Kennedy'].tier).toBe('10');
    expect(l['1 Kennedy'].midday).toBe(10);
    // Eastbound: the Sheppard short turn runs only in the rush hours and stays limited.
    expect(l['0 Sheppard'].headway).toBeNull();
    expect(l['0 Toronto Zoo'].headway).toBe(10);
  });

  it('ttc 129 weekday: the five-trip Steeles short turn is limited beside the all-day Steeles via STC', async () => {
    // Shape with 10:08 10:38 19:25 19:52 23:11 at its terminal read 28 from its pooled stops.
    const l = await lines('ttc-129-weekday-pool-hole', 'ttc', 'Weekday');
    expect(l['0 Steeles'].headway).toBeNull();
    expect(l['1 Steeles via Scarborough Centre Stn'].headway).toBe(20);
  });
});
