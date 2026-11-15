// Builds src/data/airport-hourly.json for the local-only airport story (CIV-1550, /research/airports/story).
//
// Sources: the airport study of 2026-11-14 (editorial/pitches/airport-transit-2026-11-14.md, "Data pass 2"
// plus the v3 corrections; checked against editorial/research/civ1550-airports-downtown-v3-2026-11-14.csv).
// - 157 North American airports, each matched to the agency stops within 100 m of its terminal.
// - Agency GTFS feeds as downloaded for the study (the same files Atlas uses where the download had failed:
//   RTS Gainesville, CATA Lansing). Feed stage: scripts/airport-hourly/extract_departures.py writes one
//   <IATA>.json per airport with every departure from the airport stops on each sample day.
// - Milwaukee (MKE): its GTFS was unreachable, so its hours come from Atlas's published mcts.json
//   (scripts/airport-hourly/atlas_hours.py), hour resolution only.
//
// Dates: weekday = Tuesday 2026-11-17 (stands for Monday to Friday), Saturday 2026-11-21, Sunday 2026-11-22.
// A feed whose calendar doesn't cover a date is shifted by whole weeks to the nearest covered one.
//
// Method (scripts/airportHourly.ts): a departure goes "downtown" when the same vehicle later stops within
// 1.2 km of the city's downtown point (city hall or main hub, per airport in centres.py). "With one change":
// a downtown-bound departure from any stop the airport vehicle reaches, within a 300 m walk (3 minutes
// added when the stop differs) and 60 minutes. "Any transit": any departure from the airport. An hour is
// landable when landing at its start finds such a departure within 60 minutes.
//
// Output: per airport, code, name, city, country, lat/lon (first matched airport stop), weekly landable
// hours (of 168), and per sample day three 24-bit masks [downtown, withChange, any] (bit h = hour h).
//
// Usage:
//   npx tsx scripts/build-airport-hourly.ts --per <dir of IATA.json> --hourly <dir of hour-resolution IATA.json> \
//     --curated <curated.json> --stops <dir of <slug>-stops.json> [--out src/data/airport-hourly.json]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    DAY_KEYS,
    hourFlagsWeek,
    summarizeDepartures,
    summarizeWeeks,
    type DayKey,
    type DeparturesByDay,
    type LandableSummary,
} from './airportHourly';

type RawDeparture = [number, string, string, string, boolean, boolean];
interface PerAirport {
    iata: string;
    airport: string;
    city: string;
    deps: Record<DayKey, RawDeparture[]>;
}
interface HourAirport {
    iata: string;
    hours: Record<DayKey, Record<string, [number, number]>>;
}
interface CuratedEntry {
    iata: string;
    slug: string;
    stops: [number, string, string][];
}

function arg(name: string, fallback?: string): string {
    const i = process.argv.indexOf(`--${name}`);
    const v = i >= 0 ? process.argv[i + 1] : fallback;
    if (!v) throw new Error(`missing --${name}`);
    return v;
}

const perDir = arg('per');
const hourlyDir = arg('hourly');
const curated = JSON.parse(readFileSync(arg('curated'), 'utf8')) as CuratedEntry[];
const stopsDir = arg('stops');
const out = arg('out', 'src/data/airport-hourly.json');

function readDir<T>(dir: string): Map<string, T> {
    const m = new Map<string, T>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        m.set(f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8')) as T);
    }
    return m;
}

const per = readDir<PerAirport>(perDir);
const hourly = readDir<HourAirport>(hourlyDir);

function location(iata: string): [number, number] {
    for (const e of curated.filter((c) => c.iata === iata)) {
        const stops = JSON.parse(readFileSync(join(stopsDir, `${e.slug}-stops.json`), 'utf8')) as Record<string, { lat: number; lon: number }>;
        for (const [, id] of e.stops) {
            const s = stops[id];
            if (s) return [Math.round(s.lat * 1e4) / 1e4, Math.round(s.lon * 1e4) / 1e4];
        }
    }
    throw new Error(`no location for ${iata}`);
}

const airports = [...per.values()].map((p) => {
    let summary: LandableSummary;
    const h = hourly.get(p.iata);
    if (h) {
        const hoursWith = (col: 0 | 1) =>
            Object.fromEntries(DAY_KEYS.map((d) => [d, Object.entries(h.hours[d]).filter(([, v]) => v[col] > 0).map(([k]) => Number(k))])) as Record<DayKey, number[]>;
        const downtown = hourFlagsWeek(hoursWith(0));
        // One change wasn't computed for hour-resolution airports: downtown is the lower bound.
        summary = summarizeWeeks(downtown, downtown, hourFlagsWeek(hoursWith(1)));
    } else {
        const deps = Object.fromEntries(
            DAY_KEYS.map((d) => [d, p.deps[d].map((r) => ({ minute: r[0], downtown: r[4], downtownWithChange: r[5] }))]),
        ) as DeparturesByDay;
        summary = summarizeDepartures(deps);
    }
    const [lat, lon] = location(p.iata);
    return {
        code: p.iata,
        name: p.airport,
        city: p.city,
        country: p.iata.startsWith('Y') ? 'CA' : 'US',
        lat,
        lon,
        weekly: summary.weekly,
        masks: summary.masks,
    };
});

airports.sort((a, b) => a.code.localeCompare(b.code));
const file = {
    note: 'Generated by scripts/build-airport-hourly.ts (CIV-1550). Masks: bit h = landable at hour h; [downtown, withChange, any].',
    dates: { wk: '2026-11-17', sat: '2026-11-21', sun: '2026-11-22' },
    airports,
};
writeFileSync(out, JSON.stringify(file).replace(/\},\{"code"/g, '},\n{"code"') + '\n');
console.log(`wrote ${airports.length} airports to ${out}`);
