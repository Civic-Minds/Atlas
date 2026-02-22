import { describe, it, expect } from 'vitest';
import { calculateTiers, determineTier, GtfsData, m2t } from './gtfsUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate an array of departure times (in minutes) at a fixed interval. */
function makeDepartures(startMin: number, endMin: number, intervalMin: number): number[] {
    const deps: number[] = [];
    for (let t = startMin; t <= endMin; t += intervalMin) deps.push(t);
    return deps;
}

/**
 * Build a minimal GtfsData object from a list of departure minutes.
 * All trips run on a single route (R1), direction 0, with a 7-day service.
 */
function makeGtfs(departureMinutes: number[]): GtfsData {
    const routes = [{ route_id: 'R1', route_short_name: '1', route_long_name: 'Test Route' }];
    const calendar = [{
        service_id: 'allweek',
        monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1',
        saturday: '1', sunday: '1',
        start_date: '20240101', end_date: '20241231',
    }];
    const stops = [{ stop_id: 'S1', stop_name: 'Origin', stop_lat: '43.6', stop_lon: '-79.3' }];

    const trips: any[] = [];
    const stopTimes: any[] = [];

    departureMinutes.forEach((depMin, i) => {
        const tripId = `T${i}`;
        trips.push({ trip_id: tripId, route_id: 'R1', service_id: 'allweek', direction_id: '0' });
        stopTimes.push({
            trip_id: tripId,
            stop_id: 'S1',
            stop_sequence: '1',
            departure_time: m2t(depMin),
            arrival_time: m2t(depMin),
        });
    });

    return { routes, trips, stops, stopTimes, calendar, shapes: [] };
}

// ---------------------------------------------------------------------------
// Unit tests — determineTier (pure function)
// ---------------------------------------------------------------------------

describe('determineTier', () => {
    it('assigns tier "15" to 72 perfectly consistent 15-min headways over a 1080-min span', () => {
        // 73 trips => 72 gaps, all exactly 15 min
        // span = 1080 min (5 AM–11 PM), minTrips for 15-min tier = ceil(1080/15) = 72
        const headways = Array(72).fill(15);
        expect(determineTier(headways, 73, 1080)).toBe('15');
    });
});

// ---------------------------------------------------------------------------
// Integration tests — calculateTiers with synthetic GTFS data
// ---------------------------------------------------------------------------

describe('calculateTiers — consistent 15-min all-day route', () => {
    // 5:00 AM = 300 min, 11:00 PM = 1380 min
    const START = 300;
    const END = 1380;

    it('produces exactly 3 results (Weekday, Saturday, Sunday) for a 7-day service', () => {
        const gtfs = makeGtfs(makeDepartures(START, END, 15));
        const results = calculateTiers(gtfs, START, END);
        expect(results.length).toBe(3);

        const days = results.map(r => r.day).sort();
        expect(days).toEqual(['Saturday', 'Sunday', 'Weekday']);
    });

    it('classifies every day type as tier "15"', () => {
        const gtfs = makeGtfs(makeDepartures(START, END, 15));
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.tier).toBe('15');
        }
    });

    it('reports an average headway of 15 minutes', () => {
        const gtfs = makeGtfs(makeDepartures(START, END, 15));
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.avgHeadway).toBe(15);
        }
    });

    it('reports a reliability score of 100 for perfectly regular service', () => {
        // stdDev = 0 => consistency = 100, no outlier penalty => reliability = 100
        const gtfs = makeGtfs(makeDepartures(START, END, 15));
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.reliabilityScore).toBe(100);
        }
    });

    it('counts 73 trips (5:00 AM to 11:00 PM inclusive at 15-min intervals)', () => {
        const departures = makeDepartures(START, END, 15);
        expect(departures.length).toBe(73);

        const gtfs = makeGtfs(departures);
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.tripCount).toBe(73);
        }
    });
});
