import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'stretch-departures.py');

// One route, two directions. Direction 0: 8 trips every 30 min 02:00-05:30 (A, B, C) plus one short turn
// (A, B) that is under 20% of the direction's trips, so it is not a regular pattern. Direction 1: hourly,
// and the only direction that serves stop D.
async function buildZip(): Promise<string> {
  const zip = new JSZip();
  zip.file('routes.txt', 'route_id,route_short_name\nR,9\n');
  zip.file('stops.txt', 'stop_id,stop_name\nA,Alpha\nB,Bravo\nC,Charlie\nD,Delta\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,0,0,20260101,20261231\n');
  const trips = ['trip_id,route_id,service_id,direction_id,trip_headsign'];
  const times = ['trip_id,stop_sequence,stop_id,departure_time'];
  const add = (id: string, dir: number, headsign: string, stops: string[], start: number) => {
    trips.push(`${id},R,S,${dir},${headsign}`);
    stops.forEach((stop, i) => {
      const t = start + i * 5;
      times.push(`${id},${i + 1},${stop},${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`);
    });
  };
  for (let i = 0; i < 8; i++) add(`d0-${i}`, 0, 'Charlie', ['A', 'B', 'C'], 120 + i * 30);
  add('st-0', 0, 'Bravo', ['A', 'B'], 135);
  for (let i = 0; i < 4; i++) add(`d1-${i}`, 1, 'Alpha', ['D', 'C', 'B', 'A'], 130 + i * 60);
  zip.file('trips.txt', trips.join('\n'));
  zip.file('stop_times.txt', times.join('\n'));
  const path = join(mkdtempSync(join(tmpdir(), 'oracle-')), 'x.zip');
  writeFileSync(path, await zip.generateAsync({ type: 'nodebuffer' }));
  return path;
}

const run = (zip: string, ...extra: string[]) =>
  execFileSync('python3', ['-I', SCRIPT, 'x', '9', 'Weekday', '2', '6', '--zip', zip, '--date', '2026-10-14', ...extra], { encoding: 'utf8' });

describe('stretch-departures.py', () => {
  it('finds the main stretch, the dispatch end and the departures, max gap and edges', async () => {
    const out = run(await buildZip());
    expect(out).toContain('== direction 0: 9 trips, 2 patterns, 1 regular');
    expect(out).toContain('main stretch: 3 stops');
    expect(out).toContain('dispatch end (first main-stretch stop most trips serve): Alpha (A)');
    // Stop A serves every trip: the 8 long trips (02:00-05:30 every 30) and the 02:15 short turn.
    expect(out).toContain('n=9 first=2:00 last=5:30 max gap=30 | start gap=0 end gap=30');
    expect(out).toContain('departures: 2:00 2:15 2:30 3:00 3:30 4:00 4:30 5:00 5:30');
  });

  it('measures at a chosen stop and says when a direction does not serve it', async () => {
    const out = run(await buildZip(), '--stop', 'D');
    expect(out).toContain('stop D is not served by this direction');
    expect(out).toContain('measured at: Delta (D)');
    expect(out).toContain('n=4 first=2:10 last=5:10 max gap=60');
  });
});
