import { describe, it, expect } from 'vitest';
import {
    t2m,
    m2t,
    computeMedian,
    determineTier,
    calculateTiers,
    computeRawDepartures,
    applyAnalysisCriteria,
    synthesizeCalendarFromDates,
    getModeName,
    validateGtfs,
    calculateCorridors,
    GtfsData,
    AnalysisCriteria,
    RawRouteDepartures,
} from '../gtfsUtils';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeService = (
    id: string,
    days: {
        mon?: boolean; tue?: boolean; wed?: boolean;
        thu?: boolean; fri?: boolean; sat?: boolean; sun?: boolean;
    }
) => ({
    service_id: id,
    monday: days.mon ? '1' : '0',
    tuesday: days.tue ? '1' : '0',
    wednesday: days.wed ? '1' : '0',
    thursday: days.thu ? '1' : '0',
    friday: days.fri ? '1' : '0',
    saturday: days.sat ? '1' : '0',
    sunday: days.sun ? '1' : '0',
    start_date: '20260101',
    end_date: '20261231',
});

const makeTrip = (id: string, routeId: string, serviceId: string, dirId = '0') => ({
    trip_id: id,
    route_id: routeId,
    service_id: serviceId,
    direction_id: dirId,
});

const makeStopTime = (tripId: string, depTime: string, seq = 1) => ({
    trip_id: tripId,
    stop_id: 'S1',
    arrival_time: depTime,
    departure_time: depTime,
    stop_sequence: String(seq),
});

/** Build a series of evenly-spaced trips between startMin and endMin (inclusive). */
const buildRegularService = (
    routeId: string,
    serviceId: string,
    startMin: number,
    endMin: number,
    headwayMin: number,
    dirId = '0'
): { trips: ReturnType<typeof makeTrip>[]; stopTimes: ReturnType<typeof makeStopTime>[] } => {
    const trips: ReturnType<typeof makeTrip>[] = [];
    const stopTimes: ReturnType<typeof makeStopTime>[] = [];
    let seq = 0;
    for (let t = startMin; t <= endMin; t += headwayMin) {
        const h = Math.floor(t / 60).toString().padStart(2, '0');
        const m = (t % 60).toString().padStart(2, '0');
        const tripId = `${routeId}_${serviceId}_d${dirId}_${seq}`;
        trips.push(makeTrip(tripId, routeId, serviceId, dirId));
        stopTimes.push(makeStopTime(tripId, `${h}:${m}:00`));
        seq++;
    }
    return { trips, stopTimes };
};

const BASE_STOPS = [{ stop_id: 'S1', stop_name: 'Test Stop', stop_lat: '0', stop_lon: '0' }];
const BASE_SHAPES: any[] = [];

const START = 7 * 60;   // 7:00 AM  = 420 mins
const END = 22 * 60;  // 10:00 PM = 1320 mins
const SPAN = END - START; // 900 mins

// ---------------------------------------------------------------------------
// t2m — time string to minutes
// ---------------------------------------------------------------------------

describe('t2m', () => {
    it('converts standard HH:MM:SS format', () => {
        expect(t2m('07:00:00')).toBe(420);
        expect(t2m('08:30:00')).toBe(510);
        expect(t2m('22:00:00')).toBe(1320);
        expect(t2m('00:00:00')).toBe(0);
    });

    it('handles GTFS extended times past midnight (hours > 24)', () => {
        // GTFS allows times like 25:30:00 for trips that continue past midnight
        expect(t2m('24:00:00')).toBe(1440);
        expect(t2m('25:30:00')).toBe(1530);
    });

    it('works with HH:MM format (no seconds field)', () => {
        expect(t2m('08:30')).toBe(510);
    });

    it('returns null for empty string', () => {
        expect(t2m('')).toBeNull();
    });

    it('returns null when no colon is present', () => {
        expect(t2m('invalid')).toBeNull();
        expect(t2m('0800')).toBeNull();
    });

    it('returns null for negative departure times', () => {
        // Malformed feeds can produce negative values like "-1:00:00"
        expect(t2m('-1:00:00')).toBeNull();
        expect(t2m('-0:30:00')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// m2t — minutes back to HH:MM string
// ---------------------------------------------------------------------------

describe('m2t', () => {
    it('produces zero-padded HH:MM', () => {
        expect(m2t(420)).toBe('07:00');
        expect(m2t(510)).toBe('08:30');
        expect(m2t(65)).toBe('01:05');
        expect(m2t(0)).toBe('00:00');
    });

    it('t2m and m2t are inverse operations', () => {
        const times = ['07:00', '08:30', '13:45', '22:00'];
        for (const t of times) {
            expect(m2t(t2m(t + ':00')!)).toBe(t);
        }
    });
});

// ---------------------------------------------------------------------------
// computeMedian
// ---------------------------------------------------------------------------

describe('computeMedian', () => {
    it('returns 0 for empty array', () => {
        expect(computeMedian([])).toBe(0);
    });

    it('returns the sole element for a single-element array', () => {
        expect(computeMedian([15])).toBe(15);
    });

    it('returns the middle value for odd-length arrays', () => {
        expect(computeMedian([10, 15, 20])).toBe(15);
        expect(computeMedian([5, 10, 15, 20, 25])).toBe(15);
    });

    it('returns the average of the two middle values for even-length arrays', () => {
        expect(computeMedian([10, 20, 30, 40])).toBe(25);
        expect(computeMedian([10, 20])).toBe(15);
    });

    it('sorts the array before computing (handles unsorted input)', () => {
        expect(computeMedian([30, 10, 20])).toBe(20);
        expect(computeMedian([40, 10, 30, 20])).toBe(25);
    });
});

// ---------------------------------------------------------------------------
// determineTier
// ---------------------------------------------------------------------------

describe('determineTier', () => {
    it('assigns tier "10" for consistent 10-minute service with enough trips', () => {
        // 900-min span / 10 = 90 trips minimum
        const headways = Array(90).fill(10);
        expect(determineTier(headways, 91, SPAN)).toBe('10');
    });

    it('assigns tier "15" for consistent 15-minute service with enough trips', () => {
        // 900 / 15 = 60 trips minimum
        const headways = Array(60).fill(15);
        expect(determineTier(headways, 61, SPAN)).toBe('15');
    });

    it('assigns tier "30" for consistent 30-minute service', () => {
        // 900 / 30 = 30 trips minimum
        const headways = Array(30).fill(30);
        expect(determineTier(headways, 31, SPAN)).toBe('30');
    });

    it('assigns tier "60" for consistent 60-minute service', () => {
        // 900 / 60 = 15 trips minimum
        const headways = Array(15).fill(60);
        expect(determineTier(headways, 16, SPAN)).toBe('60');
    });

    it('allows up to 2 grace violations (headway up to T+5 minutes)', () => {
        // 15-min tier allows up to 2 gaps of 16–20 minutes
        const headways = [15, 15, 20, 15, 19, 15, 15, 15, 15, 15];
        expect(determineTier(headways, 61, SPAN)).toBe('15');
    });

    it('fails a tier when there are 3+ grace violations', () => {
        // Three gaps of 20 min exceed the grace limit for the 15-min tier
        const headways = [15, 20, 20, 20, 15, 15, 15, 15, 15, 15];
        expect(determineTier(headways, 61, SPAN)).not.toBe('15');
    });

    it('fails a tier immediately on a gap exceeding T+5 (no grace)', () => {
        // A single 21-min gap immediately disqualifies the 15-min tier
        const headways = Array(60).fill(15);
        headways[30] = 21;
        expect(determineTier(headways, 61, SPAN)).not.toBe('15');
    });

    it('returns "span" when no tier is achievable', () => {
        // Wildly irregular service that can't satisfy any tier
        expect(determineTier([120, 180, 90, 150], 4, SPAN)).toBe('span');
    });

    it('returns "span" when trip count is below the minimum for every tier', () => {
        // Only 2 trips in 900 minutes — far below even 60-min tier minimum
        expect(determineTier([450], 2, SPAN)).toBe('span');
    });
});

// ---------------------------------------------------------------------------
// calculateTiers — day classification
// ---------------------------------------------------------------------------

describe('calculateTiers – day classification', () => {
    const makeGtfs = (
        serviceId: string,
        serviceDef: Parameters<typeof makeService>[1],
        routeId = 'R1',
        headway = 30
    ): GtfsData => {
        const calendar = [makeService(serviceId, serviceDef)];
        const { trips, stopTimes } = buildRegularService(routeId, serviceId, START, END, headway);
        return {
            agencies: [],
            routes: [{ route_id: routeId, route_type: '3' }],
            trips,
            stops: BASE_STOPS,
            stopTimes,
            calendar,
            shapes: BASE_SHAPES, calendarDates: [],
        };
    };

    it('classifies a Monday-only service as Weekday', () => {
        const results = calculateTiers(makeGtfs('WD', { mon: true }), START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
        expect(results.every(r => r.day !== 'Saturday')).toBe(true);
        expect(results.every(r => r.day !== 'Sunday')).toBe(true);
    });

    it('classifies a Tuesday-only service as Weekday (not just Monday)', () => {
        // Bug: prior code checked monday === "1" exclusively, so a Tue-only
        // service would produce zero results and be completely invisible.
        const results = calculateTiers(makeGtfs('TUE', { tue: true }), START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
    });

    it('classifies a Wednesday-only service as Weekday', () => {
        const results = calculateTiers(makeGtfs('WED', { wed: true }), START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
    });

    it('classifies a Thursday-only service as Weekday', () => {
        const results = calculateTiers(makeGtfs('THU', { thu: true }), START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
    });

    it('classifies a Friday-only service as Weekday', () => {
        const results = calculateTiers(makeGtfs('FRI', { fri: true }), START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
    });

    it('classifies a Saturday-only service as Saturday', () => {
        const results = calculateTiers(makeGtfs('SAT', { sat: true }), START, END);
        expect(results.some(r => r.day === 'Saturday')).toBe(true);
        expect(results.every(r => r.day !== 'Weekday')).toBe(true);
        expect(results.every(r => r.day !== 'Sunday')).toBe(true);
    });

    it('classifies a Sunday-only service as Sunday', () => {
        // Bug: prior code used "else if", so a Sunday-only service would fall
        // through only if monday and saturday were both "0", which is correct for
        // Sunday-only but only accidentally so. Verified explicitly here.
        const results = calculateTiers(makeGtfs('SUN', { sun: true }), START, END);
        expect(results.some(r => r.day === 'Sunday')).toBe(true);
        expect(results.every(r => r.day !== 'Weekday')).toBe(true);
        expect(results.every(r => r.day !== 'Saturday')).toBe(true);
    });

    it('generates BOTH Weekday AND Saturday results for a Mon–Sat service', () => {
        // Bug: prior "else if" chain meant Mon-Sat service only got 'Weekday',
        // never 'Saturday'.
        const results = calculateTiers(
            makeGtfs('MS', { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true }),
            START, END
        );
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
        expect(results.some(r => r.day === 'Saturday')).toBe(true);
        expect(results.every(r => r.day !== 'Sunday')).toBe(true);
    });

    it('generates Weekday, Saturday, AND Sunday results for a daily service', () => {
        const results = calculateTiers(
            makeGtfs('DAILY', {
                mon: true, tue: true, wed: true, thu: true, fri: true,
                sat: true, sun: true,
            }),
            START, END
        );
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
        expect(results.some(r => r.day === 'Saturday')).toBe(true);
        expect(results.some(r => r.day === 'Sunday')).toBe(true);
    });

    it('produces no results for a service with no active days', () => {
        // A service_id that is never active should contribute zero trips.
        const results = calculateTiers(makeGtfs('NONE', {}), START, END);
        expect(results.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// calculateTiers — headway accuracy
// ---------------------------------------------------------------------------

describe('calculateTiers – headway accuracy', () => {
    const weekdayCalendar = [
        makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true }),
    ];

    it('calculates avg and median headway of exactly 15 min for perfect 15-min service', () => {
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday' && x.dir === '0');
        expect(r).toBeDefined();
        expect(r!.avgHeadway).toBe(15);
        expect(r!.medianHeadway).toBe(15);
        expect(r!.tier).toBe('15');
    });

    it('calculates avg headway of exactly 30 min for perfect 30-min service', () => {
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 30);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.avgHeadway).toBe(30);
        expect(r!.tier).toBe('30');
    });

    it('reports the correct trip count for a 15-min service across the full window', () => {
        // 7:00 to 22:00 at 15-min = 61 trips (inclusive on both ends)
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.tripCount).toBe(61);
    });

    it('correctly computes gaps between consecutive departures', () => {
        // Two trips departing at 7:00 and 7:45 → single gap of 45 minutes
        const calendar = [makeService('WD', { mon: true })];
        const trips = [
            makeTrip('T1', 'R1', 'WD'),
            makeTrip('T2', 'R1', 'WD'),
        ];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '07:45:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        expect(r!.gaps).toEqual([45]);
        expect(r!.avgHeadway).toBe(45);
    });

    it('uses first stop (lowest stop_sequence) even when stop_times arrive out of order', () => {
        // Stop time records for T1 appear in the array with the later stop first.
        // The code must pick stop_sequence=1 as the trip origin.
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('T1', 'R1', 'WD'), makeTrip('T2', 'R1', 'WD')];
        const stopTimes = [
            // T1: sequence-2 record appears before sequence-1
            makeStopTime('T1', '08:00:00', 2),
            makeStopTime('T1', '07:00:00', 1),
            // T2
            makeStopTime('T2', '09:00:00', 2),
            makeStopTime('T2', '07:30:00', 1),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        // Departure times should be 7:00 and 7:30, not 8:00 and 9:00
        expect(r!.times).toEqual([420, 450]);
        expect(r!.gaps).toEqual([30]);
    });

    it('excludes trips whose origin departure falls before the start window', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [
            makeTrip('EARLY', 'R1', 'WD'), // 6:00 — before window
            makeTrip('IN1', 'R1', 'WD'), // 7:00 — in window
            makeTrip('IN2', 'R1', 'WD'), // 8:00 — in window
        ];
        const stopTimes = [
            makeStopTime('EARLY', '06:00:00'),
            makeStopTime('IN1', '07:00:00'),
            makeStopTime('IN2', '08:00:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        // Only the two in-window trips should appear
        expect(r!.tripCount).toBe(2);
        expect(r!.times).toEqual([420, 480]);
    });

    it('excludes trips whose origin departure falls after the end window', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [
            makeTrip('IN1', 'R1', 'WD'), // 21:30 — in window
            makeTrip('LATE', 'R1', 'WD'), // 22:30 — after window
        ];
        const stopTimes = [
            makeStopTime('IN1', '21:30:00'),
            makeStopTime('LATE', '22:30:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        // Only 1 in-window trip → not enough for analysis (need ≥ 2)
        const results = calculateTiers(gtfs, START, END);
        expect(results.length).toBe(0);
    });

    it('produces separate results per direction', () => {
        const d0 = buildRegularService('R1', 'WD', START, END, 15, '0');
        const d1 = buildRegularService('R1', 'WD', START, END, 30, '1');
        // Ensure unique trip IDs across both directions
        d1.trips.forEach((t, i) => { t.trip_id = `D1_${i}`; });
        d1.stopTimes.forEach((st, i) => { st.trip_id = `D1_${i}`; });

        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips: [...d0.trips, ...d1.trips],
            stops: BASE_STOPS,
            stopTimes: [...d0.stopTimes, ...d1.stopTimes],
            calendar: [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })],
            shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r0 = results.find(x => x.dir === '0' && x.day === 'Weekday');
        const r1 = results.find(x => x.dir === '1' && x.day === 'Weekday');
        expect(r0).toBeDefined();
        expect(r1).toBeDefined();
        expect(r0!.avgHeadway).toBe(15);
        expect(r1!.avgHeadway).toBe(30);
    });

    it('handles multiple routes independently', () => {
        const calendar = [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })];
        const r1 = buildRegularService('R1', 'WD', START, END, 15);
        const r2 = buildRegularService('R2', 'WD', START, END, 30);
        // Unique trip IDs
        r2.trips.forEach((t, i) => { t.trip_id = `R2_${i}`; });
        r2.stopTimes.forEach((st, i) => { st.trip_id = `R2_${i}`; });

        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }, { route_id: 'R2', route_type: '3' }],
            trips: [...r1.trips, ...r2.trips],
            stops: BASE_STOPS,
            stopTimes: [...r1.stopTimes, ...r2.stopTimes],
            calendar,
            shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const route1 = results.find(x => x.route === 'R1' && x.day === 'Weekday');
        const route2 = results.find(x => x.route === 'R2' && x.day === 'Weekday');
        expect(route1!.avgHeadway).toBe(15);
        expect(route1!.tier).toBe('15');
        expect(route2!.avgHeadway).toBe(30);
        expect(route2!.tier).toBe('30');
    });

    it('handles trips with no stop_times gracefully (skips them)', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('ORPHAN', 'R1', 'WD')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes: [], calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        expect(() => calculateTiers(gtfs, START, END)).not.toThrow();
        expect(calculateTiers(gtfs, START, END).length).toBe(0);
    });

    it('skips trips whose service_id does not appear in calendar', () => {
        // Trip references 'GHOST' service which has no calendar entry
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('T1', 'R1', 'GHOST'), makeTrip('T2', 'R1', 'WD')];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '08:00:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        // Only T2 should be counted; T1's service is unknown so it's dropped.
        // With only 1 trip, no analysis group reaches the minimum of 2.
        expect(results.length).toBe(0);
    });

    it('returns empty results when there are fewer than 2 trips in any group', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('SOLO', 'R1', 'WD')];
        const stopTimes = [makeStopTime('SOLO', '09:00:00')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        expect(results.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// calculateTiers — reliability score
// ---------------------------------------------------------------------------

describe('calculateTiers – reliability score', () => {
    it('gives a perfect score (100) for perfectly uniform headways', () => {
        const calendar = [makeService('WD', { mon: true })];
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.reliabilityScore).toBe(100);
    });

    it('gives a lower score when headways are highly variable', () => {
        const calendar = [makeService('WD', { mon: true })];
        // Alternating 10 and 50 minute gaps — very inconsistent
        const departures = [420, 430, 480, 490, 540, 550, 600, 610, 660, 670, 720];
        const trips = departures.map((_, i) => makeTrip(`T${i}`, 'R1', 'WD'));
        const stopTimes = departures.map((mins, i) => {
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return makeStopTime(`T${i}`, `${h}:${m}:00`);
        });
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.reliabilityScore).toBeLessThan(80);
    });

    it('reliability score is between 0 and 100 inclusive', () => {
        const calendar = [makeService('WD', { mon: true })];
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 30);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        for (const r of results) {
            expect(r.reliabilityScore).toBeGreaterThanOrEqual(0);
            expect(r.reliabilityScore).toBeLessThanOrEqual(100);
        }
    });
});

// ---------------------------------------------------------------------------
// all-zero calendar.txt entries (Wellington Metlink pattern)
// ---------------------------------------------------------------------------

describe('all-zero calendar.txt entries (placeholder pattern)', () => {
    // Wellington Metlink uses calendar.txt with all days=0 for every service,
    // relying entirely on calendar_dates.txt exception_type=1 entries for actual
    // service dates. The old code treated any service_id present in calendar.txt
    // as "handled by calendar.txt" and skipped its calendar_dates entries.

    it('resolves services with all-zero calendar entries via calendar_dates', () => {
        // Mondays in March 2026: 2, 9, 16, 23, 30
        const mondayDates = ['20260302', '20260309', '20260316', '20260323', '20260330'];

        // calendar.txt exists but all days are 0
        const calendar = [{
            service_id: 'SVC1',
            monday: '0', tuesday: '0', wednesday: '0', thursday: '0',
            friday: '0', saturday: '0', sunday: '0',
            start_date: '20260301', end_date: '20260430',
        }];

        // calendar_dates.txt defines the actual run dates
        const calendarDates = mondayDates.map(date => ({
            service_id: 'SVC1', date, exception_type: '1',
        }));

        const { trips, stopTimes } = buildRegularService('R1', 'SVC1', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes, calendar, calendarDates, shapes: BASE_SHAPES,
        };

        const raw = computeRawDepartures(gtfs, '20260316');
        // Should find Monday service via calendar_dates
        expect(raw.length).toBeGreaterThan(0);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        expect(monday!.tripCount).toBeGreaterThan(0);
    });

    it('does NOT pick up all-zero calendar entries via calendar.txt Step 1', () => {
        // Step 1 must skip all-zero entries — they have no active days
        const calendar = [{
            service_id: 'PLACEHOLDER',
            monday: '0', tuesday: '0', wednesday: '0', thursday: '0',
            friday: '0', saturday: '0', sunday: '0',
            start_date: '20260101', end_date: '20261231',
        }];
        // No calendar_dates — so nothing should run
        const { trips, stopTimes } = buildRegularService('R1', 'PLACEHOLDER', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes, calendar, calendarDates: [], shapes: BASE_SHAPES,
        };
        const raw = computeRawDepartures(gtfs, '20260316');
        expect(raw.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// calendar_dates.txt synthesis (feeds without calendar.txt)
// ---------------------------------------------------------------------------

describe('calendar_dates synthesis via calculateTiers', () => {
    // Helper: generate YYYYMMDD date strings for a range of weekdays/weekends
    const makeDateStr = (year: number, month: number, day: number): string => {
        return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    };

    // Generate several Mondays in January 2026 for a weekday service
    // Jan 5, 12, 19, 26 are Mondays in 2026
    const mondayDates = [
        makeDateStr(2026, 1, 5),
        makeDateStr(2026, 1, 12),
        makeDateStr(2026, 1, 19),
        makeDateStr(2026, 1, 26),
    ];

    // Generate Saturdays: Jan 3, 10, 17, 24
    const saturdayDates = [
        makeDateStr(2026, 1, 3),
        makeDateStr(2026, 1, 10),
        makeDateStr(2026, 1, 17),
        makeDateStr(2026, 1, 24),
    ];

    it('synthesizes a Weekday calendar from Monday-only calendar_dates', () => {
        // Feed has NO calendar.txt — only calendar_dates with Monday dates
        const calendarDates = mondayDates.map(d => ({
            service_id: 'WD',
            date: d,
            exception_type: '1', // service added
        }));

        const synth = synthesizeCalendarFromDates(calendarDates);

        expect(synth.length).toBe(1);
        expect(synth[0].service_id).toBe('WD');
        expect(synth[0].monday).toBe('1');
        // Other days should be '0' since only Monday dates were provided
        expect(synth[0].saturday).toBe('0');
        expect(synth[0].sunday).toBe('0');
    });

    it('synthesizes Saturday calendar from Saturday-only calendar_dates', () => {
        const calendarDates = saturdayDates.map(d => ({
            service_id: 'SAT',
            date: d,
            exception_type: '1',
        }));


        const synth = synthesizeCalendarFromDates(calendarDates);

        expect(synth.length).toBe(1);
        expect(synth[0].service_id).toBe('SAT');
        expect(synth[0].saturday).toBe('1');
        expect(synth[0].monday).toBe('0');
    });

    it('ignores exception_type 2 (removed) entries during synthesis', () => {
        const calendarDates = [
            // Added on Monday
            ...mondayDates.map(d => ({ service_id: 'WD', date: d, exception_type: '1' })),
            // "Removed" on Saturday — should be ignored entirely
            ...saturdayDates.map(d => ({ service_id: 'WD', date: d, exception_type: '2' })),
        ];


        const synth = synthesizeCalendarFromDates(calendarDates);

        expect(synth.length).toBe(1);
        expect(synth[0].saturday).toBe('0'); // Removed entries don't count
    });

    it('synthesized calendar works end-to-end with calculateTiers', () => {
        // Build a synthesized calendar from Monday dates

        const calendarDates = mondayDates.map(d => ({
            service_id: 'WD', date: d, exception_type: '1',
        }));
        const calendar = synthesizeCalendarFromDates(calendarDates);

        // Use it in calculateTiers
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes,
            calendar,
            calendarDates,
            shapes: BASE_SHAPES,
        };

        const results = calculateTiers(gtfs, START, END);
        expect(results.some(r => r.day === 'Weekday')).toBe(true);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.avgHeadway).toBe(15);
    });

    it('single-date service is visible end-to-end (synthesize + reference date cascade)', () => {
        // Reproduces the bug where a service appearing on only ONE date was invisible:
        // 1. synthesizeCalendarFromDates excluded it (below threshold → all-zero entry)
        // 2. detectReferenceDate fell back to today → 90-day window missed the single date
        // Fix: all-zero entries are excluded from synthesized calendar, and detectReferenceDate
        // falls back to the calendarDates midpoint when the synthesized calendar is empty.
        const singleDate = '20260310'; // a Monday
        const calendarDates = [{ service_id: 'SINGLE', date: singleDate, exception_type: '1' }];
        const calendar = synthesizeCalendarFromDates(calendarDates);
        // The synthesized calendar should NOT contain an all-zero entry for SINGLE
        expect(calendar.every(e => e.service_id !== 'SINGLE' || Object.values(e).some(v => v === '1'))).toBe(true);

        // Build trips for that service
        const { trips, stopTimes } = buildRegularService('R1', 'SINGLE', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes,
            calendar,
            calendarDates,
            shapes: BASE_SHAPES,
        };

        const raw = computeRawDepartures(gtfs, singleDate);
        // Service should appear under some day
        expect(raw.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Known limitations (documented, not bugs introduced here)
// ---------------------------------------------------------------------------

describe('near-duplicate departure deduplication', () => {
    it('keeps distinct departures 1 minute apart (only exact duplicates are removed)', () => {
        // Two trips depart 1 minute apart — these are distinct departures on a
        // high-frequency route. Only exact-same-minute duplicates are removed.
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('T1', 'R1', 'WD'), makeTrip('T2', 'R1', 'WD'), makeTrip('T3', 'R1', 'WD')];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '07:01:00'), // 1 min apart — kept as distinct
            makeStopTime('T3', '07:31:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        // 7:00, 7:01, 7:31 — gaps are 1 and 30
        expect(r!.gaps).toEqual([1, 30]);
        // All 3 departures kept
        expect(r!.tripCount).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Mode-aware tier thresholds
// ---------------------------------------------------------------------------

describe('mode-aware tier thresholds', () => {
    const weekdayCalendar = [
        makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true }),
    ];

    it('assigns tighter tiers for subway (route_type 1)', () => {
        // 5-min headway subway should get tier '5' (rail threshold)
        const { trips, stopTimes } = buildRegularService('SUB', 'WD', START, END, 5);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'SUB', route_type: '1' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        expect(r!.tier).toBe('5');
    });

    it('assigns tier "8" for 8-min subway service', () => {
        const { trips, stopTimes } = buildRegularService('SUB', 'WD', START, END, 8);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'SUB', route_type: '1' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.tier).toBe('8');
    });

    it('subway with 10-min service gets tier "10" (rail threshold)', () => {
        const { trips, stopTimes } = buildRegularService('SUB', 'WD', START, END, 10);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'SUB', route_type: '1' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.tier).toBe('10');
    });

    it('bus with 10-min service gets tier "10" (surface threshold)', () => {
        const { trips, stopTimes } = buildRegularService('BUS', 'WD', START, END, 10);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'BUS', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.tier).toBe('10');
    });

    it('bus does NOT get tier "5" or "8" (those are rail-only)', () => {
        const { trips, stopTimes } = buildRegularService('BUS', 'WD', START, END, 5);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'BUS', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        // Bus uses surface tiers [10,15,20,30,60], so 5-min bus should get '10'
        expect(r!.tier).toBe('10');
    });

    it('commuter rail (route_type 2) uses rail thresholds', () => {
        const { trips, stopTimes } = buildRegularService('CR', 'WD', START, END, 8);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'CR', route_type: '2' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.tier).toBe('8');
    });

    it('includes routeType and modeName in analysis results', () => {
        const { trips, stopTimes } = buildRegularService('SUB', 'WD', START, END, 10);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'SUB', route_type: '1' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r!.routeType).toBe('1');
        expect(r!.modeName).toBe('Subway/Metro');
    });

    it('defaults to bus (route_type 3) when route_type is missing', () => {
        const calendar = [makeService('WD', { mon: true })];
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const results = calculateTiers(gtfs, START, END);
        const r = results.find(x => x.day === 'Weekday');
        expect(r).toBeDefined();
        // Empty route_type falls back to '3' (bus), which uses surface tiers
        expect(r!.routeType).toBe('3');
        expect(r!.modeName).toBe('Bus');
    });
});

// ---------------------------------------------------------------------------
// getModeName
// ---------------------------------------------------------------------------

describe('getModeName', () => {
    it('maps standard GTFS route_type values', () => {
        expect(getModeName('0')).toBe('Tram/Light Rail');
        expect(getModeName('1')).toBe('Subway/Metro');
        expect(getModeName('2')).toBe('Commuter Rail');
        expect(getModeName('3')).toBe('Bus');
        expect(getModeName('4')).toBe('Ferry');
    });

    it('returns "Transit" for unknown route_type values', () => {
        expect(getModeName('9999')).toBe('Transit');
        expect(getModeName('')).toBe('Transit');
        expect(getModeName('abc')).toBe('Transit');
    });

    it('returns correct mode for GTFS extended route types', () => {
        expect(getModeName('100')).toBe('Commuter Rail');
        expect(getModeName('700')).toBe('Bus');
        expect(getModeName('715')).toBe('Bus');
        expect(getModeName('900')).toBe('Tram/Light Rail');
        expect(getModeName('999')).toBe('Tram/Light Rail');
    });
});

// ---------------------------------------------------------------------------
// determineTier — custom tier arrays
// ---------------------------------------------------------------------------

describe('determineTier with custom tiers', () => {
    it('uses rail tiers when provided', () => {
        const railTiers = [5, 8, 10, 15, 30];
        const headways = Array(180).fill(5); // 5-min headways
        expect(determineTier(headways, 181, SPAN, railTiers)).toBe('5');
    });

    it('does not assign tier "5" with default surface tiers', () => {
        const defaultTiers = [10, 15, 20, 30, 60];
        const headways = Array(180).fill(5);
        // With default tiers starting at 10, 5-min service qualifies for '10'
        expect(determineTier(headways, 181, SPAN, defaultTiers)).toBe('10');
    });
});

// ---------------------------------------------------------------------------
// GTFS Validation Engine
// ---------------------------------------------------------------------------

describe('validateGtfs', () => {
    const validGtfs: GtfsData = {
        agencies: [],
        routes: [{ route_id: 'R1', route_type: '3', route_short_name: 'R1' }],
        trips: [{ trip_id: 'T1', route_id: 'R1', service_id: 'WD' }],
        stops: [{ stop_id: 'S1', stop_name: 'Stop 1', stop_lat: '40.7128', stop_lon: '-74.0060' }],
        stopTimes: [{ trip_id: 'T1', stop_id: 'S1', departure_time: '07:00:00', arrival_time: '07:00:00', stop_sequence: '1' }],
        calendar: [makeService('WD', { mon: true })],
        calendarDates: [],
        shapes: [],
    };

    it('returns no errors for a valid feed', () => {
        const report = validateGtfs(validGtfs, 'Test Feed');
        expect(report.errors).toBe(0);
        expect(report.feedName).toBe('Test Feed');
    });

    it('reports feed summary stats', () => {
        const report = validateGtfs(validGtfs);
        expect(report.summary.routes).toBe(1);
        expect(report.summary.trips).toBe(1);
        expect(report.summary.stops).toBe(1);
        expect(report.summary.stopTimes).toBe(1);
    });

    it('detects empty routes file', () => {
        const gtfs = { ...validGtfs, routes: [] };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'E001')).toBe(true);
    });

    it('detects orphaned trips (route_id not in routes)', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            trips: [{ trip_id: 'T1', route_id: 'NONEXISTENT', service_id: 'WD' }],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'E010')).toBe(true);
    });

    it('detects orphaned stop_times (stop_id not in stops)', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            stopTimes: [{ trip_id: 'T1', stop_id: 'GHOST', departure_time: '07:00:00', arrival_time: '07:00:00', stop_sequence: '1' }],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'W012')).toBe(true);
    });

    it('detects invalid coordinates', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            stops: [{ stop_id: 'S1', stop_name: 'Bad Stop', stop_lat: '999', stop_lon: '-74.0060' }],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'E020')).toBe(true);
    });

    it('detects Null Island stops (0, 0)', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            stops: [{ stop_id: 'S1', stop_name: 'Null Island', stop_lat: '0', stop_lon: '0' }],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'W020')).toBe(true);
    });

    it('detects duplicate route_ids', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            routes: [
                { route_id: 'R1', route_type: '3' },
                { route_id: 'R1', route_type: '3' },
            ],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'E030')).toBe(true);
    });

    it('detects duplicate trip_ids (E032)', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            trips: [
                { trip_id: 'T1', route_id: 'R1', service_id: 'WD' },
                { trip_id: 'T1', route_id: 'R1', service_id: 'WD' },
            ],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'E032')).toBe(true);
        const issue = report.issues.find(i => i.code === 'E032')!;
        expect(issue.count).toBeGreaterThanOrEqual(1);
        expect(issue.examples).toContain('T1');
    });

    it('warns about missing shapes.txt', () => {
        const gtfs: GtfsData = { ...validGtfs, shapes: [] };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'W001')).toBe(true);
    });

    it('detects routes with no trips', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            routes: [
                { route_id: 'R1', route_type: '3' },
                { route_id: 'R_EMPTY', route_type: '3' },
            ],
        };
        const report = validateGtfs(gtfs);
        expect(report.issues.some(i => i.code === 'I001')).toBe(true);
    });

    it('includes example IDs in issue details', () => {
        const gtfs: GtfsData = {
            ...validGtfs,
            stops: [
                { stop_id: 'S1', stop_name: 'Bad Stop', stop_lat: '999', stop_lon: '0' },
                { stop_id: 'S2', stop_name: 'Bad Stop 2', stop_lat: '-999', stop_lon: '0' },
            ],
        };
        const report = validateGtfs(gtfs);
        const coordIssue = report.issues.find(i => i.code === 'E020');
        expect(coordIssue).toBeDefined();
        expect(coordIssue!.examples!.length).toBeGreaterThan(0);
        expect(coordIssue!.count).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// computeRawDepartures — per-individual-day extraction
// ---------------------------------------------------------------------------

describe('computeRawDepartures', () => {
    const weekdayCalendar = [
        makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true }),
    ];

    it('produces separate entries for each individual day (Mon-Fri)', () => {
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 30);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const days = raw.filter(r => r.route === 'R1' && r.dir === '0').map(r => r.day);
        expect(days).toContain('Monday');
        expect(days).toContain('Tuesday');
        expect(days).toContain('Wednesday');
        expect(days).toContain('Thursday');
        expect(days).toContain('Friday');
        expect(days).not.toContain('Saturday');
        expect(days).not.toContain('Sunday');
    });

    it('produces Saturday and Sunday entries for weekend services', () => {
        const calendar = [makeService('DAILY', {
            mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
        })];
        const { trips, stopTimes } = buildRegularService('R1', 'DAILY', START, END, 30);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const days = raw.filter(r => r.route === 'R1').map(r => r.day);
        expect(days).toContain('Saturday');
        expect(days).toContain('Sunday');
        expect(days.length).toBe(7);
    });

    it('collects ALL departure times with no time window filter', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [
            makeTrip('EARLY', 'R1', 'WD'),
            makeTrip('MID', 'R1', 'WD'),
            makeTrip('LATE', 'R1', 'WD'),
        ];
        const stopTimes = [
            makeStopTime('EARLY', '05:00:00'),  // before typical window
            makeStopTime('MID', '12:00:00'),
            makeStopTime('LATE', '23:30:00'),    // after typical window
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        // All 3 departures included — no time filtering
        expect(monday!.tripCount).toBe(3);
        expect(monday!.departureTimes).toEqual([300, 720, 1410]);
    });

    it('keeps ALL gaps with no silent filtering', () => {
        const calendar = [makeService('WD', { mon: true })];
        const trips = [
            makeTrip('T1', 'R1', 'WD'),
            makeTrip('T2', 'R1', 'WD'),
            makeTrip('T3', 'R1', 'WD'),
        ];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '07:03:00'),  // 3-min gap (old code would keep)
            makeStopTime('T3', '12:00:00'),  // 297-min gap (old code would drop > 240)
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        // Both gaps kept — 3 min AND 297 min
        expect(monday!.gaps).toEqual([3, 297]);
    });

    it('tracks which service_ids contributed', () => {
        const calendar = [
            makeService('WD1', { mon: true }),
            makeService('WD2', { mon: true }),
        ];
        const trips = [
            makeTrip('T1', 'R1', 'WD1'),
            makeTrip('T2', 'R1', 'WD2'),
        ];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '08:00:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        expect(monday!.serviceIds).toContain('WD1');
        expect(monday!.serviceIds).toContain('WD2');
        // No warning expected — multiple service_ids contributing to the same day
        // is normal GTFS practice (peak supplements, Monday-only patterns, etc.)
        // and was removed as a false-positive noisy warning.
        expect(monday!.warnings.length).toBe(0);
    });

    it('preserves route_id containing "::" in results (no key-split corruption)', () => {
        // Some feeds (e.g. SIRI-to-GTFS conversions) use "::" in route IDs.
        // Old code: key = "agency::route::0", split("::") gave routeId="agency", dirId="route".
        // Fix: store routeId/dirId in the group directly, never re-parse the key.
        const calendar = [makeService('WD', { mon: true })];
        const routeId = 'agency::route';
        const trips = [makeTrip('T1', routeId, 'WD'), makeTrip('T2', routeId, 'WD')];
        const stopTimes = [makeStopTime('T1', '07:00:00'), makeStopTime('T2', '08:00:00')];
        const gtfs: GtfsData = {
            agencies: [],
            routes: [{ route_id: routeId, route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        expect(monday!.route).toBe(routeId);  // must be full 'agency::route', not 'agency'
        expect(monday!.dir).toBe('0');         // must be '0', not 'route'
    });

    it('returns empty array when required files are missing (crash guard)', () => {
        // Simulates feeds like nested zips where inner files may not parse
        const noRoutes: GtfsData = {
            agencies: [], routes: [], trips: [], stops: BASE_STOPS,
            stopTimes: [], calendar: [], shapes: [], calendarDates: [],
        };
        expect(computeRawDepartures(noRoutes)).toEqual([]);

        const noTrips = { ...noRoutes, routes: [{ route_id: 'R1', route_type: '3' }], trips: undefined as any };
        expect(computeRawDepartures(noTrips)).toEqual([]);

        const noStopTimes = { ...noRoutes, routes: [{ route_id: 'R1', route_type: '3' }], stopTimes: undefined as any };
        expect(computeRawDepartures(noStopTimes)).toEqual([]);
    });

    it('falls back to arrival_time when departure_time is empty', () => {
        // Some GTFS feeds (especially European operators) omit departure_time entirely,
        // providing only arrival_time. Without the fallback all trips are invisible.
        const calendar = [makeService('WD', { mon: true })];
        const trips = [makeTrip('T1', 'R1', 'WD'), makeTrip('T2', 'R1', 'WD')];
        const stopTimes = [
            // departure_time intentionally empty — only arrival_time present
            { trip_id: 'T1', stop_id: 'S1', arrival_time: '07:00:00', departure_time: '', stop_sequence: '1' },
            { trip_id: 'T2', stop_id: 'S1', arrival_time: '08:00:00', departure_time: '', stop_sequence: '1' },
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        expect(monday!.departureTimes).toEqual([420, 480]);
    });

    it('keeps departures 1 minute apart across service_ids as distinct', () => {
        const calendar = [
            makeService('WD1', { mon: true }),
            makeService('WD2', { mon: true }),
        ];
        const trips = [
            makeTrip('T1', 'R1', 'WD1'),
            makeTrip('T2', 'R1', 'WD2'),
            makeTrip('T3', 'R1', 'WD1'),
        ];
        const stopTimes = [
            makeStopTime('T1', '07:00:00'),
            makeStopTime('T2', '07:01:00'),  // 1 min apart — distinct departure
            makeStopTime('T3', '08:00:00'),
        ];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday!.tripCount).toBe(3); // 7:00, 7:01, 8:00 all kept
        expect(monday!.departureTimes).toEqual([420, 421, 480]);
    });

    it('anchors reference date to trip-active services (Prague-style long-running placeholders)', () => {
        // Prague PID Czech pattern:
        // calendar.txt has year-long entries (Dec 2025 → Dec 2026) with 7 service_ids
        // sharing one start_date — making them the only "multi-entry" group, so
        // detectReferenceDate (without trips) picks that group → midpoint ≈ June 2026.
        // Short-period per-block services each have a unique start_date (singletons),
        // so they never win the multi-entry selection.
        // With refDate=June 2026, short-period services ending in March 2026 fail
        // the range check → 0 routes.
        // Fix: pass trips to detectReferenceDate; restrict calendar to trip-active
        // service_ids (short-period only) → reference date lands near 20260317 → routes found.

        // Year-long placeholder services: 7 service_ids sharing start_date '20251215'
        // (the only multi-entry group in the old logic)
        const longCalendar = ['PH_1', 'PH_2', 'PH_3', 'PH_4', 'PH_5', 'PH_6', 'PH_7'].map(id => ({
            service_id: id,
            start_date: '20251215', end_date: '20261215',
            monday: '1', tuesday: '1', wednesday: '1', thursday: '1',
            friday: '1', saturday: '1', sunday: '1',
        }));

        // Short-period service: unique start_date → singleton in the multi-entry analysis;
        // ends 20260320, well before the June 2026 midpoint of the placeholder group
        const shortCalendar = [{
            service_id: 'BLK_WD',
            start_date: '20260315', end_date: '20260320',
            monday: '1', tuesday: '1', wednesday: '1', thursday: '1',
            friday: '1', saturday: '0', sunday: '0',
        }];

        const calendar = [...longCalendar, ...shortCalendar];

        // Trips only reference the short-period service (no trips on placeholder services)
        const trips = [makeTrip('T1', 'R1', 'BLK_WD'), makeTrip('T2', 'R1', 'BLK_WD')];
        const stopTimes = [makeStopTime('T1', '07:00:00'), makeStopTime('T2', '08:00:00')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };

        // Must find Monday departures — proves reference date was anchored near 20260317,
        // not at June 2026. If June 2026 were used, BLK_WD (end_date=20260320) would
        // fail the range check and return 0 routes.
        const raw = computeRawDepartures(gtfs);
        const monday = raw.find(r => r.day === 'Monday');
        expect(monday).toBeDefined();
        expect(monday!.tripCount).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// applyAnalysisCriteria — custom criteria application
// ---------------------------------------------------------------------------

describe('applyAnalysisCriteria', () => {
    const weekdayCalendar = [
        makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true }),
    ];

    it('filters departures to the configured time window', () => {
        const { trips, stopTimes } = buildRegularService('R1', 'WD', 300, 1400, 15); // 5:00 to 23:20
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);

        // Narrow window: 9:00–17:00
        const criteria: AnalysisCriteria = {
            id: 'test', name: 'Test',
            dayTypes: {
                Weekday: { timeWindow: { start: 540, end: 1020 }, tiers: [10, 15, 20, 30, 60] },
            },
            graceMinutes: 5, maxGraceViolations: 2,
        };
        const results = applyAnalysisCriteria(raw, criteria);
        const weekday = results.find(r => r.day === 'Weekday');
        expect(weekday).toBeDefined();
        // All departure times should be within 9:00–17:00
        for (const t of weekday!.times) {
            expect(t).toBeGreaterThanOrEqual(540);
            expect(t).toBeLessThanOrEqual(1020);
        }
    });

    it('uses custom grace settings', () => {
        const { trips, stopTimes } = buildRegularService('R1', 'WD', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar: weekdayCalendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);

        // Zero grace — any violation fails
        const strictCriteria: AnalysisCriteria = {
            id: 'strict', name: 'Strict',
            dayTypes: {
                Weekday: { timeWindow: { start: START, end: END }, tiers: [15] },
            },
            graceMinutes: 0, maxGraceViolations: 0,
        };
        const strictResults = applyAnalysisCriteria(raw, strictCriteria);
        const strict = strictResults.find(r => r.day === 'Weekday');
        expect(strict).toBeDefined();
        // Perfect 15-min service should still pass with zero grace
        expect(strict!.tier).toBe('15');
    });

    it('rolls up weekday results using WORST tier across Mon-Fri', () => {
        // Mon-Thu: 15-min service, Fri: 30-min service
        const monThu = makeService('MT', { mon: true, tue: true, wed: true, thu: true });
        const fri = makeService('FRI', { fri: true });
        const mt = buildRegularService('R1', 'MT', START, END, 15);
        const fr = buildRegularService('R1', 'FRI', START, END, 30);
        // Ensure unique trip IDs
        fr.trips.forEach((t, i) => { t.trip_id = `FRI_${i}`; });
        fr.stopTimes.forEach((st, i) => { st.trip_id = `FRI_${i}`; });

        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips: [...mt.trips, ...fr.trips],
            stops: BASE_STOPS,
            stopTimes: [...mt.stopTimes, ...fr.stopTimes],
            calendar: [monThu, fri],
            shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const results = applyAnalysisCriteria(raw);
        const weekday = results.find(r => r.day === 'Weekday');
        expect(weekday).toBeDefined();
        // Worst tier is Friday's 30-min, so weekday rollup should be '30'
        expect(weekday!.tier).toBe('30');
    });

    it('warns when route does not run all 5 weekdays', () => {
        const calendar = [makeService('MWF', { mon: true, wed: true, fri: true })];
        const { trips, stopTimes } = buildRegularService('R1', 'MWF', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);
        const results = applyAnalysisCriteria(raw);
        const weekday = results.find(r => r.day === 'Weekday');
        expect(weekday).toBeDefined();
        expect(weekday!.warnings).toBeDefined();
        expect(weekday!.warnings!.some(w => w.includes('3/5 weekdays'))).toBe(true);
        expect(weekday!.daysIncluded).toEqual(['Monday', 'Wednesday', 'Friday']);
    });

    it('excludes day types not present in criteria', () => {
        const calendar = [makeService('DAILY', {
            mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
        })];
        const { trips, stopTimes } = buildRegularService('R1', 'DAILY', START, END, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }], trips, stops: BASE_STOPS,
            stopTimes, calendar, shapes: BASE_SHAPES, calendarDates: [],
        };
        const raw = computeRawDepartures(gtfs);

        // Only weekday criteria — no Saturday or Sunday
        const criteria: AnalysisCriteria = {
            id: 'wd-only', name: 'Weekday Only',
            dayTypes: {
                Weekday: { timeWindow: { start: START, end: END }, tiers: [10, 15, 20, 30, 60] },
            },
            graceMinutes: 5, maxGraceViolations: 2,
        };
        const results = applyAnalysisCriteria(raw, criteria);
        expect(results.every(r => r.day === 'Weekday')).toBe(true);
    });

    it('determineTier respects custom graceMinutes and maxGraceViolations', () => {
        // 15-min headways with 3 gaps of 18 min (3 min over)
        const headways = [15, 18, 15, 18, 15, 18, 15, 15, 15, 15];
        // With grace=5, maxViolations=2 → fails (3 violations)
        expect(determineTier(headways, 61, SPAN, [15], 5, 2)).toBe('span');
        // With grace=5, maxViolations=3 → passes
        expect(determineTier(headways, 61, SPAN, [15], 5, 3)).toBe('15');
        // With grace=0 → fails (any over)
        expect(determineTier(headways, 61, SPAN, [15], 0, 0)).toBe('span');
    });
});

// ---------------------------------------------------------------------------
// frequency-based trip expansion
// ---------------------------------------------------------------------------

describe('frequency-based trip expansion', () => {
    const calendar = [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })];
    const baseStop = BASE_STOPS[0];

    const makeFreqTrip = (tripId: string, routeId: string) => ({
        trip_id: tripId,
        route_id: routeId,
        service_id: 'WD',
        direction_id: '0',
    });

    const makeFreq = (tripId: string, start: string, end: string, headwaySecs: string) => ({
        trip_id: tripId,
        start_time: start,
        end_time: end,
        headway_secs: headwaySecs,
    });

    it('expands frequency trips into individual departures', () => {
        // 15-min headway from 07:00 to 09:00 → 8 departures (0, 15, 30, 45, 60, 75, 90, 105 min past 7:00)
        const trips = [makeFreqTrip('T1', 'R1')];
        const stopTimes = [makeStopTime('T1', '07:00:00')];
        const frequencies = [makeFreq('T1', '07:00:00', '09:00:00', '900')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: [baseStop], stopTimes, calendar, shapes: [], calendarDates: [], frequencies,
        };
        const raw = computeRawDepartures(gtfs);
        const mon = raw.find(r => r.day === 'Monday');
        expect(mon).toBeDefined();
        // 07:00 to 08:45 inclusive at 15-min intervals = 8 trips
        expect(mon!.tripCount).toBe(8);
        expect(mon!.departureTimes[0]).toBe(420); // 07:00
        expect(mon!.departureTimes[7]).toBe(525); // 08:45
    });

    it('rejects sub-60s headways to prevent trip explosion', () => {
        // headway_secs=1 would generate 61,200 synthetic trips for a 17-hour day
        const trips = [makeFreqTrip('T1', 'R1')];
        const stopTimes = [makeStopTime('T1', '07:00:00')];
        const frequencies = [makeFreq('T1', '07:00:00', '24:00:00', '1')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: [baseStop], stopTimes, calendar, shapes: [], calendarDates: [], frequencies,
        };
        const raw = computeRawDepartures(gtfs);
        // Should produce no results — the frequency entry is rejected
        expect(raw.length).toBe(0);
    });

    it('rejects headway_secs=59 (just below 60s threshold)', () => {
        const trips = [makeFreqTrip('T1', 'R1')];
        const stopTimes = [makeStopTime('T1', '07:00:00')];
        const frequencies = [makeFreq('T1', '07:00:00', '09:00:00', '59')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: [baseStop], stopTimes, calendar, shapes: [], calendarDates: [], frequencies,
        };
        const raw = computeRawDepartures(gtfs);
        expect(raw.length).toBe(0);
    });

    it('accepts headway_secs=60 (minimum valid headway)', () => {
        const trips = [makeFreqTrip('T1', 'R1')];
        const stopTimes = [makeStopTime('T1', '07:00:00')];
        // 60s headway over 2 hours = 120 trips
        const frequencies = [makeFreq('T1', '07:00:00', '09:00:00', '60')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: [baseStop], stopTimes, calendar, shapes: [], calendarDates: [], frequencies,
        };
        const raw = computeRawDepartures(gtfs);
        const mon = raw.find(r => r.day === 'Monday');
        expect(mon).toBeDefined();
        expect(mon!.tripCount).toBe(120); // 07:00 to 08:59, every minute
    });

    it('produces no float accumulation at end of long frequency block', () => {
        // 900s (15-min) headway over 17 hours (07:00–24:00) — many iterations
        const trips = [makeFreqTrip('T1', 'R1')];
        const stopTimes = [makeStopTime('T1', '07:00:00')];
        const frequencies = [makeFreq('T1', '07:00:00', '24:00:00', '900')];
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: [baseStop], stopTimes, calendar, shapes: [], calendarDates: [], frequencies,
        };
        const raw = computeRawDepartures(gtfs);
        const mon = raw.find(r => r.day === 'Monday');
        expect(mon).toBeDefined();
        // Every departure time should be an exact integer (no float accumulation)
        for (const t of mon!.departureTimes) {
            expect(t % 1).toBe(0);
        }
        // Last departure should be 23:45 = 1425 min (not 1424.9999...)
        const last = mon!.departureTimes[mon!.departureTimes.length - 1];
        expect(last).toBe(1425);
    });
});

// ---------------------------------------------------------------------------
// calculateCorridors — multi-route shared-link analysis
// ---------------------------------------------------------------------------

describe('calculateCorridors', () => {
    // Build a minimal GTFS where two routes share a stop pair S1→S2
    const makeCorridorGtfs = (headwayMins: number): GtfsData => {
        const calendar = [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })];
        const routes = [
            { route_id: 'R1', route_type: '3' },
            { route_id: 'R2', route_type: '3' },
        ];
        const stops = [
            { stop_id: 'S1', stop_name: 'Stop A', stop_lat: '43.6', stop_lon: '-79.4' },
            { stop_id: 'S2', stop_name: 'Stop B', stop_lat: '43.61', stop_lon: '-79.4' },
        ];

        const trips: ReturnType<typeof makeTrip>[] = [];
        const stopTimes: Array<{ trip_id: string; stop_id: string; arrival_time: string; departure_time: string; stop_sequence: string }> = [];

        for (const routeId of ['R1', 'R2']) {
            for (let t = 420; t <= 540; t += headwayMins) {
                const h = Math.floor(t / 60).toString().padStart(2, '0');
                const m = (t % 60).toString().padStart(2, '0');
                const tripId = `${routeId}_${t}`;
                trips.push(makeTrip(tripId, routeId, 'WD'));
                stopTimes.push({ trip_id: tripId, stop_id: 'S1', arrival_time: `${h}:${m}:00`, departure_time: `${h}:${m}:00`, stop_sequence: '1' });
                const t2 = t + 5;
                const h2 = Math.floor(t2 / 60).toString().padStart(2, '0');
                const m2 = (t2 % 60).toString().padStart(2, '0');
                stopTimes.push({ trip_id: tripId, stop_id: 'S2', arrival_time: `${h2}:${m2}:00`, departure_time: `${h2}:${m2}:00`, stop_sequence: '2' });
            }
        }

        return { agencies: [], routes, trips, stops, stopTimes, calendar, calendarDates: [], shapes: [] };
    };

    it('identifies corridors shared by 2+ routes', () => {
        const gtfs = makeCorridorGtfs(15);
        const corridors = calculateCorridors(gtfs, 'Weekday', 420, 540);
        expect(corridors.length).toBeGreaterThan(0);
        const link = corridors.find(c => c.linkId === 'S1->S2');
        expect(link).toBeDefined();
        expect(link!.routeIds).toContain('R1');
        expect(link!.routeIds).toContain('R2');
    });

    it('excludes links served by only one route', () => {
        // Single-route feed — no corridors
        const calendar = [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })];
        const { trips, stopTimes } = buildRegularService('R1', 'WD', 420, 540, 15);
        const gtfs: GtfsData = {
            agencies: [], routes: [{ route_id: 'R1', route_type: '3' }],
            trips, stops: BASE_STOPS, stopTimes, calendar, calendarDates: [], shapes: [],
        };
        const corridors = calculateCorridors(gtfs, 'Weekday', 420, 540);
        expect(corridors.length).toBe(0);
    });

    it('returns empty array when no trips fall in the time window', () => {
        const gtfs = makeCorridorGtfs(15);
        // Window entirely outside service hours
        const corridors = calculateCorridors(gtfs, 'Weekday', 0, 60);
        expect(corridors.length).toBe(0);
    });

    it('corridor avgHeadway is lower than single-route headway (combined frequency)', () => {
        // Two routes each running every 30 min but offset by 15 → combined ~15 min headway
        const calendar = [makeService('WD', { mon: true, tue: true, wed: true, thu: true, fri: true })];
        const routes = [
            { route_id: 'R1', route_type: '3' },
            { route_id: 'R2', route_type: '3' },
        ];
        const stops = [
            { stop_id: 'S1', stop_name: 'Stop A', stop_lat: '43.6', stop_lon: '-79.4' },
            { stop_id: 'S2', stop_name: 'Stop B', stop_lat: '43.61', stop_lon: '-79.4' },
        ];
        const trips: ReturnType<typeof makeTrip>[] = [];
        const stopTimes: Array<{ trip_id: string; stop_id: string; arrival_time: string; departure_time: string; stop_sequence: string }> = [];
        // R1: 7:00, 7:30, 8:00, 8:30, 9:00
        // R2: 7:15, 7:45, 8:15, 8:45  (offset +15)
        const r1Times = [420, 450, 480, 510, 540];
        const r2Times = [435, 465, 495, 525];
        for (const t of r1Times) {
            const h = Math.floor(t / 60).toString().padStart(2, '0');
            const m = (t % 60).toString().padStart(2, '0');
            const tripId = `R1_${t}`;
            trips.push(makeTrip(tripId, 'R1', 'WD'));
            stopTimes.push({ trip_id: tripId, stop_id: 'S1', arrival_time: `${h}:${m}:00`, departure_time: `${h}:${m}:00`, stop_sequence: '1' });
            const t2 = t + 5;
            const h2 = Math.floor(t2 / 60).toString().padStart(2, '0');
            const m2 = (t2 % 60).toString().padStart(2, '0');
            stopTimes.push({ trip_id: tripId, stop_id: 'S2', arrival_time: `${h2}:${m2}:00`, departure_time: `${h2}:${m2}:00`, stop_sequence: '2' });
        }
        for (const t of r2Times) {
            const h = Math.floor(t / 60).toString().padStart(2, '0');
            const m = (t % 60).toString().padStart(2, '0');
            const tripId = `R2_${t}`;
            trips.push(makeTrip(tripId, 'R2', 'WD'));
            stopTimes.push({ trip_id: tripId, stop_id: 'S1', arrival_time: `${h}:${m}:00`, departure_time: `${h}:${m}:00`, stop_sequence: '1' });
            const t2 = t + 5;
            const h2 = Math.floor(t2 / 60).toString().padStart(2, '0');
            const m2 = (t2 % 60).toString().padStart(2, '0');
            stopTimes.push({ trip_id: tripId, stop_id: 'S2', arrival_time: `${h2}:${m2}:00`, departure_time: `${h2}:${m2}:00`, stop_sequence: '2' });
        }
        const gtfs: GtfsData = { agencies: [], routes, trips, stops, stopTimes, calendar, calendarDates: [], shapes: [] };
        const corridors = calculateCorridors(gtfs, 'Weekday', 420, 540);
        const link = corridors.find(c => c.linkId === 'S1->S2');
        expect(link).toBeDefined();
        // Combined headway should be ~15 min (interleaved 30-min routes)
        expect(link!.avgHeadway).toBeLessThan(30);
    });

    it('results are sorted by avgHeadway ascending', () => {
        const gtfs = makeCorridorGtfs(15);
        const corridors = calculateCorridors(gtfs, 'Weekday', 420, 540);
        for (let i = 1; i < corridors.length; i++) {
            expect(corridors[i].avgHeadway).toBeGreaterThanOrEqual(corridors[i - 1].avgHeadway);
        }
    });

    it('handles Saturday day type', () => {
        const calendar = [
            makeService('SAT', { sat: true }),
        ];
        const routes = [
            { route_id: 'R1', route_type: '3' },
            { route_id: 'R2', route_type: '3' },
        ];
        const stops = [
            { stop_id: 'S1', stop_name: 'Stop A', stop_lat: '43.6', stop_lon: '-79.4' },
            { stop_id: 'S2', stop_name: 'Stop B', stop_lat: '43.61', stop_lon: '-79.4' },
        ];
        const trips: ReturnType<typeof makeTrip>[] = [];
        const stopTimes: Array<{ trip_id: string; stop_id: string; arrival_time: string; departure_time: string; stop_sequence: string }> = [];
        for (const routeId of ['R1', 'R2']) {
            for (let t = 420; t <= 540; t += 20) {
                const h = Math.floor(t / 60).toString().padStart(2, '0');
                const m = (t % 60).toString().padStart(2, '0');
                const tripId = `${routeId}_${t}`;
                trips.push(makeTrip(tripId, routeId, 'SAT'));
                stopTimes.push({ trip_id: tripId, stop_id: 'S1', arrival_time: `${h}:${m}:00`, departure_time: `${h}:${m}:00`, stop_sequence: '1' });
                const t2 = t + 5;
                const h2 = Math.floor(t2 / 60).toString().padStart(2, '0');
                const m2 = (t2 % 60).toString().padStart(2, '0');
                stopTimes.push({ trip_id: tripId, stop_id: 'S2', arrival_time: `${h2}:${m2}:00`, departure_time: `${h2}:${m2}:00`, stop_sequence: '2' });
            }
        }
        const gtfs: GtfsData = { agencies: [], routes, trips, stops, stopTimes, calendar, calendarDates: [], shapes: [] };
        const corridors = calculateCorridors(gtfs, 'Saturday', 420, 540);
        expect(corridors.length).toBeGreaterThan(0);
    });
});
