import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-1456: TTC's branch letters live only in the raw trip headsigns ("West - 52A Lawrence West towards Pearson
// Airport"), which cleaning drops. Processing keeps the code as a display-only property on the row.
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

async function feed(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\n52,52,Lawrence West,3\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,1,1,20260801,20271231\n');
  const patterns = [
    { key: 'A', dir: 1, headsign: 'West - 52A Lawrence West towards Pearson Airport via Dixon Rd', lon: -79.60 },
    { key: 'G', dir: 1, headsign: 'West - 52G Lawrence West towards Martin Grove via The Westway', lon: -79.55 },
    { key: 'B', dir: 0, headsign: 'East - 52 Lawrence West towards Lawrence Station', lon: -79.40 },
  ];
  const stops = ['stop_id,stop_name,stop_lat,stop_lon'];
  const shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const p of patterns) {
    for (let s = 1; s <= 4; s++) {
      stops.push(`${p.key}${s},${p.key} stop ${s},${43.70 + s * 0.005},${p.lon + s * 0.01}`);
      shapes.push(`sh${p.key},${43.70 + s * 0.005},${p.lon + s * 0.01},${s}`);
    }
    for (let m = 360, n = 0; m <= 1320; m += 15, n++) {
      const trip = `${p.key}-${n}`;
      trips.push(`52,wk,${trip},${p.headsign},${p.dir},sh${p.key}`);
      for (let s = 1; s <= 4; s++) times.push(`${trip},${clock(m + s * 3)},${clock(m + s * 3)},${p.key}${s},${s}`);
    }
  }
  zip.file('stops.txt', stops.join('\n') + '\n');
  zip.file('shapes.txt', shapes.join('\n') + '\n');
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('branch IDs from raw headsigns (CIV-1456)', () => {
  it('keeps the code a headsign leads with on its row, and sets none on a base trip', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test', riderWeek: true, serviceAnchor: '20261118' });
    const rows = (JSON.parse(result.geojson).features as Array<{ properties: Record<string, unknown> }>)
      .map(f => f.properties).filter(p => p.routeId === '52' && p.stopId == null && p.day === 'Weekday');
    const codeOf = (fragment: string) => rows.find(p => String(p.headsign ?? '').includes(fragment))?.branchCode;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(codeOf('Pearson')).toBe('52A');
    expect(codeOf('Martin Grove')).toBe('52G');
    expect(codeOf('Lawrence Station')).toBeUndefined();
  });
});
