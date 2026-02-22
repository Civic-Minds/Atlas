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

    it('assigns tier "30" to a mixed 10/20/30-min headway set — LIMITATION: masks peak service', () => {
        // Real-world peak/off-peak schedule: 24×10 min, 21×20 min, 14×30 min headways
        // avg headway ≈ 18 min, but the off-peak 30-min gaps prevent any tier below 30.
        //
        // T=10: needs ceil(1080/10)=108 trips, have 60 → skip
        // T=15: needs ceil(1080/15)=72 trips, have 60 → skip
        // T=20: 30-min gaps exceed T+GRACE (25) → fail
        // T=30: all gaps ≤ 30 → PASS → returns '30'
        //
        // The algorithm correctly enforces the tier rules, but a single tier per day
        // cannot represent "10 min peak / 30 min base" service.
        const headways = [
            ...Array(24).fill(10),  // peak gaps
            ...Array(21).fill(20),  // midday gaps
            ...Array(14).fill(30),  // off-peak gaps
        ];
        expect(determineTier(headways, 60, 1080)).toBe('30');
    });
});

// ---------------------------------------------------------------------------
// Integration tests — calculateTiers with synthetic GTFS data
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Integration tests — peak/off-peak variable headway route
// ---------------------------------------------------------------------------

/**
 * Build a schedule that mirrors real-world peak/base service:
 *   5:00–7:00 AM   every 30 min  (pre-peak,        4 trips)
 *   7:00–9:00 AM   every 10 min  (morning peak,   13 trips)
 *   9:20 AM–3:40 PM every 20 min (midday,         20 trips)
 *   4:00–6:00 PM   every 10 min  (afternoon peak, 13 trips)
 *   6:30–11:00 PM  every 30 min  (evening,        10 trips)
 *                                              ─────────────
 *                                               total: 60 trips
 *
 * Resulting headways: 24×10, 21×20, 14×30  →  avg ≈ 18.3 min
 */
function makePeakOffPeakDepartures(): number[] {
    return [
        ...makeDepartures(300, 390, 30),   // 5:00–6:30 AM  (pre-peak)
        ...makeDepartures(420, 540, 10),   // 7:00–9:00 AM  (morning peak)
        ...makeDepartures(560, 940, 20),   // 9:20 AM–3:40 PM (midday)
        ...makeDepartures(960, 1080, 10),  // 4:00–6:00 PM  (afternoon peak)
        ...makeDepartures(1110, 1380, 30), // 6:30–11:00 PM (evening)
    ];
}

describe('calculateTiers — peak/off-peak variable headway route', () => {
    const START = 300;  // 5:00 AM
    const END = 1380;   // 11:00 PM

    it('builds a schedule with 60 trips and no duplicate departure times', () => {
        const deps = makePeakOffPeakDepartures();
        expect(deps.length).toBe(60);
        expect(new Set(deps).size).toBe(60); // all unique
    });

    it('classifies the route as tier "30" despite running every 10 min during peak — LIMITATION', () => {
        // The single-tier-per-day model cannot express "10 min peak / 30 min base".
        // The 30-min off-peak gaps prevent qualifying for any tier below 30.
        const gtfs = makeGtfs(makePeakOffPeakDepartures());
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.tier).toBe('30');
        }
    });

    it('reports an average headway significantly better than the assigned tier suggests', () => {
        // avg ≈ 18.3 min, but tier = '30' — the tier understates service quality
        const gtfs = makeGtfs(makePeakOffPeakDepartures());
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.avgHeadway).toBeCloseTo(18.3, 0); // within ±0.5 min
            expect(r.avgHeadway).toBeLessThan(20);     // clearly better than tier implies
        }
    });

    it('reports a reliability score below 70 due to headway variance across service periods', () => {
        // stdDev ≈ 7.9 min across mixed 10/20/30-min headways
        // outlier penalty applied for 30-min gaps (> avg*1.5 ≈ 27 min)
        // expected reliability ≈ 53–55
        const gtfs = makeGtfs(makePeakOffPeakDepartures());
        const results = calculateTiers(gtfs, START, END);

        for (const r of results) {
            expect(r.reliabilityScore).toBeLessThan(70);
            expect(r.reliabilityScore).toBeGreaterThan(30); // still plausible, not zero
        }
    });
});

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
