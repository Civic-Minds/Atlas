import { describe, expect, it } from 'vitest';
import type { DayName, GtfsData, GtfsRoute } from '../../types/gtfs.js';
import { computeRunningTimes, runningTimesJson } from '../runningTime.js';

const ALL: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

type Trip = { id: string; shape?: string; dir?: string; start: number; stops: string[]; minutes: number; service?: string };

function feed(trips: Trip[], frequencies: GtfsData['frequencies'] = []): GtfsData {
  const route: GtfsRoute = { route_id: 'r1', route_short_name: '29', route_type: '3' };
  return {
    agencies: [], routes: [route], stops: [], calendar: [], calendarDates: [], shapes: [], frequencies,
    trips: trips.map(t => ({ route_id: 'r1', service_id: t.service ?? 'wk', trip_id: t.id, direction_id: t.dir === undefined ? '0' : t.dir, shape_id: t.shape ?? 'main' })),
    stopTimes: trips.flatMap(t => t.stops.map((stop, i) => {
      const time = hm(t.start + Math.round((t.minutes * i) / (t.stops.length - 1)));
      return { trip_id: t.id, stop_id: stop, stop_sequence: String(i + 1), arrival_time: time, departure_time: time };
    })),
  } as unknown as GtfsData;
}

function run(gtfs: GtfsData, services = ['wk'], analysisShapes = new Map<string, Set<string>>()) {
  const active = new Map(ALL.map(d => [d, new Set(services)]));
  return computeRunningTimes(gtfs, new Map(gtfs.routes.map(r => [r.route_id, r])), active, analysisShapes);
}

const line = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('scheduled running time (CIV-84)', () => {
  it('takes the median end-to-end minutes by departure hour and by period', () => {
    const trips: Trip[] = [
      ...[480, 490, 500].map((s, i) => ({ id: `am${i}`, start: s, stops: line, minutes: [50, 52, 54][i] })),
      ...[720, 735].map((s, i) => ({ id: `mid${i}`, start: s, stops: line, minutes: 44 })),
    ];
    const rt = run(feed(trips)).get('r1::0::Weekday')!;
    expect(rt.byHour['8']).toBe(52);
    expect(rt.byHour['12']).toBe(44);
    expect(rt.byPeriod.amPeak).toEqual({ median: 52, min: 50, max: 54 });
    expect(rt.loop).toBeUndefined();
  });

  it('leaves out short turns and partial trips instead of letting them pull the median down', () => {
    const trips: Trip[] = [
      ...[480, 490, 500, 510].map((s, i) => ({ id: `full${i}`, start: s, stops: line, minutes: 60 })),
      ...[485, 495, 505].map((s, i) => ({ id: `short${i}`, start: s, stops: line.slice(0, 4), minutes: 30 })),
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(60);
  });

  it('never lets a direction of 2-stop shuttles become the pattern (TTC 52)', () => {
    const trips: Trip[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `shuttle${i}`, start: 480 + i * 5, stops: ['a', 'b'], minutes: 3 })),
      ...[480, 495].map((s, i) => ({ id: `long${i}`, start: s, stops: [...line, 'g', 'h', 'i', 'j'], minutes: 70 })),
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(70);
  });

  it('measures a loop as a full loop and flags it, never halving it', () => {
    const loop = ['hub', 'b', 'c', 'd', 'hub'];
    const rt = run(feed([0, 1, 2].map(i => ({ id: `l${i}`, start: 600 + i * 20, stops: loop, minutes: 40 })))).get('r1::0::Weekday')!;
    expect(rt.loop).toBe(true);
    expect(rt.byHour['10']).toBe(40);
  });

  it('handles trips past midnight in extended GTFS times', () => {
    const rt = run(feed([1500, 1520].map((s, i) => ({ id: `n${i}`, start: s, stops: line, minutes: 35 })))).get('r1::0::Weekday')!;
    expect(rt.byHour['25']).toBe(35);
    expect(rt.byPeriod.late?.median).toBe(35);
  });

  it('applies a frequency template\'s duration to every departure it expands to', () => {
    const gtfs = feed([{ id: 'tmpl', start: 0, stops: line, minutes: 42 }],
      [{ trip_id: 'tmpl', start_time: '07:00:00', end_time: '08:00:00', headway_secs: '600' }]);
    expect(run(gtfs).get('r1::0::Weekday')!.byHour['7']).toBe(42);
  });

  it('shows nothing rather than a guess: one trip an hour, or bad times, give no value', () => {
    const gtfs = feed([{ id: 'only', start: 480, stops: line, minutes: 50 }]);
    expect(run(gtfs).get('r1::0::Weekday')).toBeUndefined();
    // A trip whose end precedes its start is dropped outright.
    const backwards = feed([0, 1].map(i => ({ id: `x${i}`, start: 600 + i * 10, stops: line, minutes: -20 })));
    expect(run(backwards).get('r1::0::Weekday')).toBeUndefined();
  });

  it('counts identical trips under overlapping service_ids once', () => {
    const trips: Trip[] = [
      ...[480, 500].map((s, i) => ({ id: `a${i}`, start: s, stops: line, minutes: 50 })),
      ...[480].map(s => ({ id: 'dup', start: s, stops: line, minutes: 90, service: 'wk2' })),
    ];
    expect(run(feed(trips), ['wk', 'wk2']).get('r1::0::Weekday')!.byHour['8']).toBe(50);
  });

  it('serializes compactly as h (by hour) and p ([median, min, max] by period)', () => {
    const rt = run(feed([480, 490].map((s, i) => ({ id: `t${i}`, start: s, stops: line, minutes: 50 }))));
    expect(runningTimesJson(rt)).toEqual({ 'r1::0::Weekday': { h: { '8': 50 }, p: { amPeak: [50, 50, 50] } }, 'r1::0::Saturday': { h: { '8': 50 }, p: { amPeak: [50, 50, 50] } }, 'r1::0::Sunday': { h: { '8': 50 }, p: { amPeak: [50, 50, 50] } } });
  });

  it('keys a blank direction like shape selection for the lookup, and like route features for output', () => {
    const trips: Trip[] = [
      ...[480, 495].map((s, i) => ({ id: `main${i}`, dir: '', start: s, stops: line, minutes: 55 })),
      // A short turn on another shape: a different terminal pair, so it never joins the main pattern.
      ...[485, 500, 510].map((s, i) => ({ id: `other${i}`, dir: '', shape: 'other', start: s, stops: line.slice(0, 4), minutes: 20 })),
    ];
    // Shape selection keys a blank direction as 'r1::' and picked 'main'; output uses direction '0'.
    const rt = run(feed(trips), ['wk'], new Map([['r1::', new Set(['main'])]]));
    expect(rt.get('r1::0::Weekday')!.byHour['8']).toBe(55);
  });

  it('measures length against the typical trip, so one long interlined trip can\'t move the bar', () => {
    const long = [...line, ...['g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't']];
    const trips: Trip[] = [
      ...[480, 490, 500].map((s, i) => ({ id: `t${i}`, start: s, stops: line, minutes: 40 })),
      { id: 'interlined', start: 470, stops: long, minutes: 120 },
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(40);
  });

  it('takes one stop pattern between the terminals, so express runs don\'t blend with locals', () => {
    const express = ['a', 'c', 'f'];
    const trips: Trip[] = [
      ...[480, 490, 500, 510].map((s, i) => ({ id: `local${i}`, start: s, stops: line, minutes: 50 })),
      ...[485, 495, 505].map((s, i) => ({ id: `express${i}`, start: s, stops: express, minutes: 30 })),
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(50);
  });

  it('counts a one-trip frequency window (TransLoc style) as one trip, not several (#702)', () => {
    // A 42-minute window for a 42-minute trip with a meaningless 900-s headway: one trip, not three.
    const gtfs = feed([{ id: 'tl', start: 480, stops: line, minutes: 42 }],
      [{ trip_id: 'tl', start_time: '08:00:00', end_time: '08:42:00', headway_secs: '900' }]);
    expect(run(gtfs).get('r1::0::Weekday')).toBeUndefined();
  });

  it('keeps a two-terminal route (a ferry) whose every trip has two stops', () => {
    const rt = run(feed([600, 630].map((s, i) => ({ id: `f${i}`, start: s, stops: ['dock1', 'dock2'], minutes: 25 }))));
    expect(rt.get('r1::0::Weekday')!.byHour['10']).toBe(25);
  });

  it('ignores a lone outlier 4x+ the normal length when cutting shuttles', () => {
    const long = Array.from({ length: 25 }, (_, i) => `x${i}`);
    const trips: Trip[] = [
      ...[480, 490, 500, 510].map((s, i) => ({ id: `t${i}`, start: s, stops: line, minutes: 40 })),
      { id: 'interlined', start: 470, stops: long, minutes: 150 },
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(40);
  });

  it('never lets several 2-stop trips win beside a 7-stop line', () => {
    const seven = [...line, 'g'];
    const trips: Trip[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, start: 480 + i * 5, stops: ['a', 'b'], minutes: 4 })),
      ...[480, 500].map((s, i) => ({ id: `l${i}`, start: s, stops: seven, minutes: 30 })),
    ];
    expect(run(feed(trips)).get('r1::0::Weekday')!.byHour['8']).toBe(30);
    // Even when the analysis shape is the shuttle's, the full line is measured.
    const shuttleShape = trips.map(t => (t.id.startsWith('s') ? { ...t, shape: 'shuttle' } : t));
    expect(run(feed(shuttleShape), ['wk'], new Map([['r1::0', new Set(['shuttle'])]])).get('r1::0::Weekday')!.byHour['8']).toBe(30);
  });
});


describe('one full pattern under several shape ids (#852)', () => {
  it('pools same-stop trips whatever their shape_id, so a shape per time band still gives every hour', () => {
    // TTC gives the identical Finch to Vaughan run a shape per time band (6-9h, 9-16h, ...).
    const bands = [['s6', 360, 540], ['s9', 540, 960], ['s16', 960, 1140], ['s19', 1140, 1260]] as const;
    const trips: Trip[] = bands.flatMap(([shape, from, to]) => {
      const out: Trip[] = [];
      for (let start = from; start < to; start += 10) out.push({ id: `${shape}-${start}`, shape, start, stops: line, minutes: 50 });
      return out;
    });
    // Only one band's shape is the busiest or the analysis shape: before the fix the other hours were blank.
    const rt = run(feed(trips), ['wk'], new Map([['r1::0', new Set(['s9'])]]));
    const hours = Object.keys(rt.get('r1::0::Weekday')!.byHour).map(Number).sort((a, b) => a - b);
    expect(hours[0]).toBe(6);
    expect(hours[hours.length - 1]).toBe(20);
    expect(rt.get('r1::0::Weekday')!.byHour['7']).toBe(50);
  });
});
