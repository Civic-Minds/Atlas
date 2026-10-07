import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { filterLargeGtfsZipByAgencyId } from '../largeGtfsFilter.js';
import { parseGtfsZip } from '../parseGtfs.js';

describe('filterLargeGtfsZipByAgencyId', () => {
  it('keeps one agency and all dependent GTFS records', async () => {
    const input = Buffer.from(zipSync({
      'agency.txt': Buffer.from('agency_id,agency_name\na,Alpha\nb,Beta\n'),
      'routes.txt': Buffer.from('route_id,agency_id,route_short_name,route_type\nr1,a,1,3\nr2,b,2,3\n'),
      'trips.txt': Buffer.from('route_id,service_id,trip_id,shape_id\nr1,s1,t1,sh1\nr2,s2,t2,sh2\n'),
      'stops.txt': Buffer.from('stop_id,stop_name,stop_lat,stop_lon\nstop1,One,1,1\nstop2,Two,2,2\n'),
      'stop_times.txt': Buffer.from('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,stop1,1\nt2,08:00:00,08:00:00,stop2,1\n'),
      'calendar.txt': Buffer.from('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns1,1,1,1,1,1,0,0,20260101,20261231\ns2,1,1,1,1,1,0,0,20260101,20261231\n'),
      'shapes.txt': Buffer.from('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nsh1,1,1,1\nsh2,2,2,1\n'),
    }, { level: 1 }));

    const filtered = await parseGtfsZip(filterLargeGtfsZipByAgencyId(input, 'a'));
    expect(filtered.agencies.map(row => row.agency_id)).toEqual(['a']);
    expect(filtered.routes.map(row => row.route_id)).toEqual(['r1']);
    expect(filtered.trips.map(row => row.trip_id)).toEqual(['t1']);
    expect(filtered.stopTimes.map(row => row.trip_id)).toEqual(['t1']);
    expect(filtered.stops.map(row => row.stop_id)).toEqual(['stop1']);
    expect(filtered.shapes.map(row => row.id)).toEqual(['sh1']);
    expect(filtered.calendar.map(row => row.service_id)).toEqual(['s1']);
  });
});
