import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function line(name: string, slug: string, day: string, headsign: string): Promise<any> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties)
    .find((p: any) => p.stopId == null && p.day === day && p.headsign === headsign);
}

/** The stop tiers along the line, collapsed to runs ('-' for a stop with no grade). */
function tierRuns(p: any): string[] {
  const runs: string[] = [];
  for (const stopId of p.stopOrder as string[]) {
    const t = p.stopTiers?.[stopId] ?? '-';
    if (runs[runs.length - 1] !== t) runs.push(t);
  }
  return runs;
}

// CIV-152: every drawn stop carries its every-gap grade on its pooled list, the method the
// route tier uses, so the map can colour the line section by section without showing a stop
// better than its own gaps allow.
describe('stopTiers', () => {
  it('cta J14 Saturday: the 4-trip Madison & Jefferson shape is graded by the pooled trunk at every stop', async () => {
    // Real CTA feed (2026-11-30), route J14 Saturday, shapes thinned 10x. The drawn shape has
    // four trips of its own (CIV-150: it read 455 before #690); every stop pools with the
    // every-10 service, so the stops grade 15 and 10 while the route's own tier stays
    // infrequent (the tier only degrades, and the #728 lift needs the headsign pool).
    const p = await line('cta-j14-saturday', 'cta', 'Saturday', 'Madison & Jefferson');
    expect(p.headway).toBe(10);
    expect(p.tier).toBe('infrequent');
    expect(Object.keys(p.stopTiers)).toHaveLength(p.stopOrder.length);
    expect(tierRuns(p)).toEqual(['15', '10', '15']);
  });

  it('ttc 96 weekday York Mills via Martin Grove: the shared trunk grades 10, the branch-only stretches 20', async () => {
    // Real TTC feed, route 96 eastbound weekday (fixture of #772). Where 96A, 96B and 96C run
    // together the pooled list grades every 10; the stretches only this branch serves keep 20.
    const p = await line('ttc-96-weekday-east', 'ttc', 'Weekday', 'York Mills via Martin Grove and Westhumber');
    expect(p.tier).toBe('20');
    expect(tierRuns(p)).toEqual(['20', '10', '20', '10', '15']);
    // A stop's tier is never better than its headway's tier.
    for (const stopId of p.stopOrder as string[]) {
      const hw = p.stopHeadways[stopId];
      if (hw == null) continue;
      const byHeadway = hw <= 10 ? '10' : hw <= 15 ? '15' : hw <= 20 ? '20' : hw <= 30 ? '30' : hw <= 60 ? '60' : 'infrequent';
      expect(['10', '15', '20', '30', '60', 'infrequent'].indexOf(p.stopTiers[stopId])).toBeGreaterThanOrEqual(['10', '15', '20', '30', '60', 'infrequent'].indexOf(byHeadway));
    }
  });
});
