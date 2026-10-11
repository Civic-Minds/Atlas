import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  dropCoincidentTemplateDepartures,
  expandTripFrequencyOffsets,
  firstVisitStopTimes,
  processGtfsBuffer,
  windowsRepeatedByTimetable,
} from '../process-core';

// Fixtures below copy window rows, headways and departure times from the archived feeds:
// uga 20260911.zip (routes 5738 M Milledge, 5746 L Eastside) and the published
// grand-junction zip (route R1, trip RT1). Stop lists are shortened.

function hm(mins: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
}
const m = (time: string) => {
  const [h, min] = time.split(':').map(Number);
  return h * 60 + min;
};

// uga trip 1119047 (M Milledge template, first stop 00:00): two window sets over the same hours.
const M_WINDOWS: Array<[string, string, number]> = [
  ['07:00', '08:00', 2100], ['08:00', '16:30', 1080], ['16:30', '18:30', 2100],
  ['07:00', '07:30', 2100], ['07:30', '08:30', 1050], ['08:30', '09:00', 700],
  ['09:00', '15:00', 525], ['15:00', '16:30', 700], ['16:30', '18:30', 1050],
];
// The 39 scheduled M Milledge trips in the same feed (first departures).
const M_SCHEDULED = '07:00 07:30 07:45 08:08 08:27 08:30 08:45 09:00 09:15 09:30 09:45 10:00 10:15 10:30 10:45 11:00 11:15 11:30 11:45 12:00 12:15 12:30 12:45 13:00 13:15 13:30 13:45 14:00 14:15 14:30 14:45 15:23 15:40 16:08 16:30 16:53 17:15 17:38 18:00'.split(' ');
// uga templates 1140532 / 1140533 (L Eastside) and the 24 scheduled L trips.
const L_WINDOWS: Array<[string, string, string, number]> = [
  ['l-am', '07:00', '07:30', 1350], ['l-am', '07:30', '09:00', 900], ['l-am', '09:00', '10:00', 675],
  ['l-am', '10:00', '10:30', 900], ['l-am', '10:30', '11:59', 1350],
  ['l-pm', '12:00', '15:00', 1350], ['l-pm', '15:00', '18:30', 2700],
];
const L_SCHEDULED = '07:00 07:45 08:30 09:01 09:15 09:38 10:00 10:23 10:45 11:08 11:30 11:53 12:16 12:38 13:01 13:23 13:46 14:08 14:31 14:53 15:38 16:23 17:08 17:53'.split(' ');

function ugaFixtureZip(): JSZip {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Campus Transit,https://example.test,America/New_York\n');
  zip.file('routes.txt', [
    'route_id,route_short_name,route_long_name,route_type',
    '5738,M,Milledge,3',
    '5746,L,Eastside Limited,3',
    '9000,T,Template Only,3',
    '9100,E,Evening Extension,3',
  ].join('\n') + '\n');
  zip.file('stops.txt', [
    'stop_id,stop_name,stop_lat,stop_lon',
    'm1,Milledge Start,33.94,-83.37', 'm2,Milledge Middle,33.93,-83.38', 'm3,Milledge End,33.92,-83.39',
    'l1,Eastside Start,33.95,-83.33', 'l2,Eastside End,33.96,-83.30',
    't1,Template Start,33.90,-83.40', 't2,Template End,33.89,-83.41',
    'e1,Evening Start,33.97,-83.42', 'e2,Evening End,33.98,-83.43',
  ].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20250101,20271231\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'shm,33.94,-83.37,1', 'shm,33.93,-83.38,2', 'shm,33.92,-83.39,3',
    'shl,33.95,-83.33,1', 'shl,33.96,-83.30,2',
    'sht,33.90,-83.40,1', 'sht,33.89,-83.41,2',
    'she,33.97,-83.42,1', 'she,33.98,-83.43,2',
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const frequencies = ['trip_id,start_time,end_time,headway_secs'];

  // M Milledge: 00:00 template with both window sets, plus the full timetable.
  trips.push('5738,wk,m-template,,,shm');
  stopTimes.push(`m-template,${hm(0)},${hm(0)},m1,1`, `m-template,${hm(17)},${hm(17)},m2,2`, `m-template,${hm(35)},${hm(35)},m3,3`);
  for (const [start, end, secs] of M_WINDOWS) frequencies.push(`m-template,${start}:00,${end}:00,${secs}`);
  M_SCHEDULED.forEach((time, i) => {
    const start = m(time);
    trips.push(`5738,wk,m${i},,,shm`);
    stopTimes.push(`m${i},${hm(start)},${hm(start)},m1,1`, `m${i},${hm(start + 17)},${hm(start + 17)},m2,2`, `m${i},${hm(start + 35)},${hm(start + 35)},m3,3`);
  });

  // L Eastside: two 00:00 templates (no overlap between them), plus the timetable.
  for (const id of ['l-am', 'l-pm']) {
    trips.push(`5746,wk,${id},,,shl`);
    stopTimes.push(`${id},${hm(0)},${hm(0)},l1,1`, `${id},${hm(45)},${hm(45)},l2,2`);
  }
  for (const [id, start, end, secs] of L_WINDOWS) frequencies.push(`${id},${start}:00,${end}:00,${secs}`);
  L_SCHEDULED.forEach((time, i) => {
    const start = m(time);
    trips.push(`5746,wk,l${i},,,shl`);
    stopTimes.push(`l${i},${hm(start)},${hm(start)},l1,1`, `l${i},${hm(start + 45)},${hm(start + 45)},l2,2`);
  });

  // The M template's overlapping window sets on their own (no timetable): the first set
  // (18 min midday) must not stack with the second.
  trips.push('9000,wk,t-template,,,sht');
  stopTimes.push(`t-template,${hm(0)},${hm(0)},t1,1`, `t-template,${hm(35)},${hm(35)},t2,2`);
  for (const [start, end, secs] of M_WINDOWS) frequencies.push(`t-template,${start}:00,${end}:00,${secs}`);

  // A route whose template repeats a 07:00-18:00 timetable every 15 minutes but also
  // carries an evening window the timetable never reaches: the evening keeps its service.
  trips.push('9100,wk,e-template,,,she');
  stopTimes.push(`e-template,${hm(0)},${hm(0)},e1,1`, `e-template,${hm(20)},${hm(20)},e2,2`);
  frequencies.push('e-template,07:00:00,18:00:00,900', 'e-template,19:00:00,22:00:00,1800');
  for (let start = 7 * 60; start < 18 * 60; start += 15) {
    trips.push(`9100,wk,e${start},,,she`);
    stopTimes.push(`e${start},${hm(start)},${hm(start)},e1,1`, `e${start},${hm(start + 20)},${hm(start + 20)},e2,2`);
  }

  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  zip.file('frequencies.txt', frequencies.join('\n') + '\n');
  return zip;
}

// grand-junction R1 (trip RT1, exact_times=1): one hourly loop that leaves S87 at :15 and
// comes back to S87 at :05 of the next hour.
function grandJunctionFixtureZip(): JSZip {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Loop Transit,https://example.test,America/Denver\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nR1,1,Airport,3\n');
  zip.file('stops.txt', [
    'stop_id,stop_name,stop_lat,stop_lon',
    'S87,Transfer Center,39.07,-108.56', 'S166,North,39.09,-108.55', 'S142,Airport,39.12,-108.53', 'S139,Return,39.10,-108.54',
  ].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,0,0,20250101,20271231\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'RT1,39.07,-108.56,1', 'RT1,39.09,-108.55,2', 'RT1,39.12,-108.53,3', 'RT1,39.10,-108.54,4', 'RT1,39.07,-108.56,5',
  ].join('\n') + '\n');
  zip.file('trips.txt', 'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nR1,WD,RT1,Airport,0,RT1\n');
  zip.file('stop_times.txt', [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    'RT1,05:15:00,05:15:00,S87,1', 'RT1,05:25:00,05:25:00,S166,13', 'RT1,05:35:00,05:35:00,S142,24',
    'RT1,05:45:00,05:45:00,S139,34', 'RT1,06:05:00,06:05:00,S87,60',
  ].join('\n') + '\n');
  zip.file('frequencies.txt', 'trip_id,start_time,end_time,headway_secs,exact_times\nRT1,5:15:00,20:05:00,3600,1\n');
  return zip;
}

async function weekdayRoutes(zip: JSZip, slug: string) {
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  const features = JSON.parse(result.geojson).features.filter((feature: any) => feature.properties.day === 'Weekday');
  return (shortName: string) => features.filter((feature: any) => feature.properties.routeShortName === shortName).map((feature: any) => feature.properties);
}

describe('expandTripFrequencyOffsets (#711)', () => {
  it('does not stack a second window set over the same hours', () => {
    const windows = M_WINDOWS.map(([start, end, secs]) => ({ start: m(start), end: m(end), headwayMinutes: secs / 60 }));
    const departures = expandTripFrequencyOffsets(0, windows).sort((a, b) => a - b);
    const midday = departures.filter(t => t >= m('09:00') && t < m('15:00'));
    const gaps = midday.slice(1).map((t, i) => t - midday[i]);
    expect(gaps.every(gap => gap === 18)).toBe(true);
  });

  it('keeps back-to-back and after-midnight rows on one trip', () => {
    // uga trip 1152800 (C-N): 18:30-25:00 every 1000 s, then 01:00-02:30 and 02:30-03:00.
    const windows = [
      { start: m('18:30'), end: m('25:00'), headwayMinutes: 1000 / 60 },
      { start: m('01:00'), end: m('02:30'), headwayMinutes: 25 },
      { start: m('02:30'), end: m('03:00'), headwayMinutes: 50 },
    ];
    const offsets = expandTripFrequencyOffsets(0, windows);
    expect(offsets.filter(t => t >= m('18:30'))).toHaveLength(24);
    expect(offsets.filter(t => t < m('03:00'))).toEqual([m('01:00'), m('01:25'), m('01:50'), m('02:15'), m('02:30')]);
  });
});

describe('windowsRepeatedByTimetable (#711)', () => {
  const toWindow = ([start, end, secs]: [string, string, number]) => ({ start: m(start), end: m(end), headwayMinutes: secs / 60 });

  it('drops the windows a matching timetable already lists', () => {
    const windows = M_WINDOWS.slice(0, 3).map(toWindow);
    const repeated = windowsRepeatedByTimetable([{ windows, departures: 33 }], M_SCHEDULED.map(m));
    expect([...repeated]).toEqual(windows);
  });

  it('keeps a window the timetable never reaches', () => {
    const daytime = M_WINDOWS.slice(0, 3).map(toWindow);
    const evening = toWindow(['19:00', '22:00', 1800]);
    const repeated = windowsRepeatedByTimetable([{ windows: [...daytime, evening], departures: 39 }], M_SCHEDULED.map(m));
    expect(repeated.has(evening)).toBe(false);
    expect(daytime.every(window => repeated.has(window))).toBe(true);
  });

  it('keeps a frequency block that only has a few scheduled extras inside it', () => {
    // terrebonne-parish 21: scheduled trips at 12:02, 16:16 and 17:50 next to ~40 frequency departures.
    const windows = [toWindow(['16:09', '16:28', 840]), toWindow(['06:20', '08:31', 840])];
    expect(windowsRepeatedByTimetable([{ windows, departures: 40 }], [m('12:02'), m('16:16'), m('17:50')]).size).toBe(0);
  });
});

describe('firstVisitStopTimes (#712)', () => {
  it('keeps the first visit of a stop a loop passes twice, in stop_sequence order', () => {
    const visits = firstVisitStopTimes([
      { stop_id: 'S87', stop_sequence: '60' },
      { stop_id: 'S166', stop_sequence: '13' },
      { stop_id: 'S87', stop_sequence: '1' },
    ]);
    expect(visits.map(v => `${v.stop_id}:${v.stop_sequence}`)).toEqual(['S87:1', 'S166:13']);
  });
});

describe('processGtfsBuffer frequency dedupe on real feed patterns', () => {
  it('uses the timetable, not timetable plus template, for uga M Milledge and L Eastside (#711)', async () => {
    const route = await weekdayRoutes(ugaFixtureZip(), 'campus-transit');
    const [milledge] = route('M');
    expect(milledge.headway).toBe(15);
    expect(milledge.headwayByPeriod?.midday).toBe(15);
    expect(Object.values(milledge.stopHeadways ?? {}).every(hw => (hw as number) >= 15)).toBe(true);
    const [eastside] = route('L');
    expect(eastside.headway).toBe(23);
    expect(eastside.headwayByPeriod?.midday).toBe(23);
  });

  it('expands overlapping window sets on one template trip only once (#711)', async () => {
    const route = await weekdayRoutes(ugaFixtureZip(), 'campus-transit');
    const [template] = route('T');
    expect(template.headway).toBe(18);
    expect(template.headwayByPeriod?.midday).toBe(18);
  });

  it('keeps a template window outside the timetable hours (#711)', async () => {
    const route = await weekdayRoutes(ugaFixtureZip(), 'campus-transit');
    const [evening] = route('E');
    expect(evening.headwayByPeriod?.midday).toBe(15);
    expect(evening.headwayByPeriod?.evening).toBe(30);
    expect(evening.stopPeriodHeadways?.e1?.evening).toBe(30);
  });

  it('does not count a template trip\'s literal 00:00 stop_times as late-night service (#721)', async () => {
    // uga writes each template at 00:00 (M Milledge 1119047: 00:00-00:35). M's real service
    // ends with the 18:00 trip, and the template-only route T's windows end at 18:30.
    const route = await weekdayRoutes(ugaFixtureZip(), 'campus-transit');
    for (const shortName of ['M', 'T']) {
      const [feature] = route(shortName);
      expect(feature.periodCoverageHeadway?.late ?? null).toBeNull();
      expect(feature.periodCoverageHeadway?.overnight ?? null).toBeNull();
      expect(feature.headwayByPeriod?.midday).toBe(shortName === 'M' ? 15 : 18);
    }
  });

  it('counts an hourly loop once per stop, not at both visits (#712)', async () => {
    const route = await weekdayRoutes(grandJunctionFixtureZip(), 'loop-transit');
    const [loop] = route('1');
    expect(loop.headway).toBe(60);
    expect(loop.headwayByPeriod).toMatchObject({ midday: 60, pmPeak: 60 });
    expect(loop.stopHeadways?.S87).toBe(60);
  });
});

// clemson-cat 20501230 zip, route TL-69 (Gold), service TL-272 (Mon-Fri): three TransLoc
// block trips on one stop pattern, every 1213 s. Gold_02 runs 15 min behind Gold_01 until
// 13:45, then Gold_03 restarts 0.7 min behind Gold_01's 13:44 pass. Only the first and last
// stops are timed (the block's start and end), as in the feed.
const GOLD_STOPS: Array<[string, number, number]> = [
  ['TL-301', 34.6860294, -82.8250393], ['TL-302', 34.6876091, -82.8191632], ['TL-303', 34.6849145, -82.8158081],
  ['TL-304', 34.68407, -82.8171458], ['TL-305', 34.6838809, -82.8194462], ['TL-308', 34.6797698, -82.8301056],
  ['TL-309', 34.6798291, -82.8348944], ['TL-310', 34.6765561, -82.8410815], ['TL-306', 34.6776148, -82.8301743],
  ['TL-307', 34.6790709, -82.8301814],
];
const GOLD_BLOCKS: Array<[string, string, string]> = [
  ['TL-4257', '07:00', '18:07'], ['TL-4258', '07:15', '13:45'], ['TL-4259', '13:45', '17:52'],
];

function clemsonGoldFixtureZip(): JSZip {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Clemson Area Transit,https://example.test,America/New_York\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nTL-69,Gold,Gold Route,3\n');
  zip.file('stops.txt', ['stop_id,stop_name,stop_lat,stop_lon', ...GOLD_STOPS.map(([id, lat, lon]) => `${id},${id},${lat},${lon}`)].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nTL-272,1,1,1,1,1,0,0,20240819,20501230\n');
  zip.file('shapes.txt', ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', ...GOLD_STOPS.map(([, lat, lon], i) => `TL-69,${lat},${lon},${i + 1}`)].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const frequencies = ['trip_id,start_time,end_time,headway_secs'];
  for (const [tripId, start, end] of GOLD_BLOCKS) {
    trips.push(`TL-69,TL-272,${tripId},,0,TL-69`);
    GOLD_STOPS.forEach(([stopId], i) => {
      const time = i === 0 ? `${start}:00` : i === GOLD_STOPS.length - 1 ? `${end}:00` : '';
      stopTimes.push(`${tripId},${time},${time},${stopId},${i === 0 ? 1 : i * 10 + 10}`);
    });
    frequencies.push(`${tripId},${start}:00,${end}:00,1213`);
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  zip.file('frequencies.txt', frequencies.join('\n') + '\n');
  return zip;
}

describe('dropCoincidentTemplateDepartures (#711)', () => {
  it('drops a block that restarts on top of another block, keeps an offset one', () => {
    const cycle = 1213 / 60;
    const run = (first: number, end: number) => {
      const offsets: number[] = [];
      for (let t = first; t < end; t += cycle) offsets.push(t - first);
      return { first, offsets };
    };
    const [gold1, gold2, gold3] = dropCoincidentTemplateDepartures([
      run(m('07:00'), m('18:07')), run(m('07:15'), m('13:45')), run(m('13:45'), m('17:52')),
    ]);
    expect(gold1).toHaveLength(33);
    expect(gold2).toHaveLength(20);
    expect(gold3).toEqual([]);
  });
});

describe('processGtfsBuffer stacked TransLoc blocks (#711)', () => {
  it('gives clemson-cat Gold its two-bus service, not 5 midday and 1 in the afternoon', async () => {
    const route = await weekdayRoutes(clemsonGoldFixtureZip(), 'clemson-cat');
    const [gold] = route('Gold');
    // Hand count at TL-301: Gold_01 + Gold_02 alternate 15/5 min gaps until 13:45, then the
    // afternoon has one bus every 20.2 min (Gold_03 is Gold_01's departure again).
    expect(gold.stopPeriodHeadways?.['TL-301']).toMatchObject({ amPeak: 15, midday: 15, pmPeak: 20 });
    expect(gold.minStopHeadway).toBeGreaterThanOrEqual(15);
  });
});

// cue-bus zip, route TL-2, service TL-10: two early trips written as single-trip frequency
// rows (TL-739 05:15-05:46 and TL-740 05:50-06:21, 1727 s) next to the scheduled timetable
// (06:00, 06:30, 07:07, ...). Two stops; every trip takes 31 min, as TL-739/TL-740 do.
function cueBusFixtureZip(): JSZip {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,CUE,https://example.test,America/New_York\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nTL-2,Gold,Nutley,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\nTL-48,Start,38.846,-77.306\nTL-60,Nutley Street,38.883,-77.229\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nTL-10,1,1,1,1,1,0,0,20250101,20271231\n');
  zip.file('shapes.txt', 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nsh,38.846,-77.306,1\nsh,38.883,-77.229,2\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const starts = ['05:15', '05:50', '06:00', '06:30', '07:07', '07:37', '08:14', '08:45'];
  for (const start of starts) {
    trips.push(`TL-2,TL-10,t${start},Nutley Street,0,sh`);
    stopTimes.push(`t${start},${hm(m(start))},${hm(m(start))},TL-48,1`, `t${start},${hm(m(start) + 31)},${hm(m(start) + 31)},TL-60,2`);
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  zip.file('frequencies.txt', 'trip_id,start_time,end_time,headway_secs\nt05:15,05:15:00,05:46:00,1727\nt05:50,05:50:00,06:21:00,1727\n');
  return zip;
}

describe('processGtfsBuffer single-trip rows next to a timetable (#721)', () => {
  it('keeps cue-bus TL-2\'s 05:50 trip whose row holds the 06:00 timetable start', async () => {
    const route = await weekdayRoutes(cueBusFixtureZip(), 'cue-bus');
    const [line] = route('Gold');
    // Terminal departures 06:21 (the 05:50 trip), 06:31, 07:01, 07:38, 08:08, 08:45 in the AM
    // peak: gaps 10/30/37/30/37, median 30. Losing the 05:50 trip gives 34.
    expect(line.headwayByPeriod?.amPeak).toBe(30);
  });
});
