import { describe, it, expect } from 'vitest';
import { runSimulation, DEFAULT_PARAMS, SimulationParams } from '../engine/simulationEngine';
import { Stop } from '../data/routeData';
import { generatePerformanceData, hashRouteId } from '../data/tripPerformance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Straight line of stops separated by ~111m (0.001° latitude ≈ 111m) */
const makeStops = (count: number): Stop[] =>
    Array.from({ length: count }, (_, i) => ({
        id: `S${i}`,
        name: `Stop ${i}`,
        lat: 43.65 + i * 0.001,
        lng: -79.38,
        isTerminal: i === 0 || i === count - 1,
    }));

const TWO_STOPS = makeStops(2);
const FIVE_STOPS = makeStops(5);
const TEN_STOPS = makeStops(10);

const allIds = (stops: Stop[]) => new Set(stops.map(s => s.id));

// ---------------------------------------------------------------------------
// runSimulation — basic output shape
// ---------------------------------------------------------------------------

describe('runSimulation – output shape', () => {
    it('returns a valid result with correct field types', () => {
        const result = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        expect(result).toHaveProperty('totalTimeSeconds');
        expect(result).toHaveProperty('formattedTime');
        expect(result).toHaveProperty('totalDistanceMeters');
        expect(result).toHaveProperty('averageSpeedKmh');
        expect(result).toHaveProperty('numberOfStops');
        expect(result).toHaveProperty('stopsRemoved');
        expect(result).toHaveProperty('timeSavedSeconds');
        expect(result).toHaveProperty('maxGapMeters');
        expect(result).toHaveProperty('segmentTimes');
        expect(typeof result.totalTimeSeconds).toBe('number');
        expect(typeof result.formattedTime).toBe('string');
        expect(result.segmentTimes.length).toBe(FIVE_STOPS.length - 1);
    });

    it('returns zero result when fewer than 2 stops are enabled', () => {
        const result = runSimulation(FIVE_STOPS, new Set(['S0']), DEFAULT_PARAMS);
        expect(result.totalTimeSeconds).toBe(0);
        expect(result.numberOfStops).toBe(1);
        expect(result.formattedTime).toBe('0s');
    });
});

// ---------------------------------------------------------------------------
// runSimulation — travel time accuracy
// ---------------------------------------------------------------------------

describe('runSimulation – travel time', () => {
    it('includes dwell time for all non-terminal active stops', () => {
        const result = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        // 5 stops: 2 terminals + 3 intermediate
        // Terminal dwell: 2 × 60 = 120s
        // Intermediate dwell: 3 × (20 + 15) = 105s
        // Total dwell = 225s + travel time
        const expectedDwell = 2 * DEFAULT_PARAMS.terminalDwellSeconds
            + 3 * (DEFAULT_PARAMS.dwellTimeSeconds + DEFAULT_PARAMS.accelPenaltySeconds);
        expect(result.totalTimeSeconds).toBeGreaterThanOrEqual(expectedDwell);
    });

    it('travel time is proportional to distance', () => {
        const r5 = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        const r10 = runSimulation(TEN_STOPS, allIds(TEN_STOPS), DEFAULT_PARAMS);
        // 10 stops is roughly 2× the distance of 5 stops
        expect(r10.totalDistanceMeters).toBeGreaterThan(r5.totalDistanceMeters * 1.5);
    });

    it('removing stops reduces total time', () => {
        const full = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        const reduced = runSimulation(FIVE_STOPS, new Set(['S0', 'S2', 'S4']), DEFAULT_PARAMS);
        expect(reduced.totalTimeSeconds).toBeLessThan(full.totalTimeSeconds);
    });
});

// ---------------------------------------------------------------------------
// runSimulation — stop removal tracking
// ---------------------------------------------------------------------------

describe('runSimulation – stop removal', () => {
    it('correctly counts removed stops', () => {
        const result = runSimulation(FIVE_STOPS, new Set(['S0', 'S4']), DEFAULT_PARAMS);
        expect(result.numberOfStops).toBe(2);
        expect(result.stopsRemoved).toBe(3);
    });

    it('timeSavedSeconds is 0 when all stops are enabled', () => {
        const result = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        expect(result.timeSavedSeconds).toBe(0);
    });

    it('timeSavedSeconds is positive when stops are removed', () => {
        const result = runSimulation(FIVE_STOPS, new Set(['S0', 'S2', 'S4']), DEFAULT_PARAMS);
        expect(result.timeSavedSeconds).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// runSimulation — max gap detection
// ---------------------------------------------------------------------------

describe('runSimulation – max gap detection', () => {
    it('detects the largest walking gap between active stops', () => {
        // Enable only terminals: gap is the entire route
        const result = runSimulation(FIVE_STOPS, new Set(['S0', 'S4']), DEFAULT_PARAMS);
        expect(result.maxGapMeters).toBeGreaterThan(0);
        // The gap should be roughly 4 × 111m = 444m
        expect(result.maxGapMeters).toBeGreaterThan(400);
        expect(result.maxGapMeters).toBeLessThan(500);
    });

    it('returns stop names for the max gap', () => {
        const result = runSimulation(FIVE_STOPS, new Set(['S0', 'S4']), DEFAULT_PARAMS);
        expect(result.maxWalkingGapStops).toEqual(['Stop 0', 'Stop 4']);
    });
});

// ---------------------------------------------------------------------------
// runSimulation — per-stop overrides
// ---------------------------------------------------------------------------

describe('runSimulation – per-stop overrides', () => {
    it('custom dwell time increases total time', () => {
        const baseline = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS);
        const withOverride = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS, {
            S2: { dwellTimeSeconds: 60 }
        });
        // Override adds 40s extra dwell to stop S2 (60 - 20 default)
        expect(withOverride.totalTimeSeconds).toBeGreaterThan(baseline.totalTimeSeconds);
    });

    it('overrides only apply to specified stops', () => {
        const withOne = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS, {
            S1: { dwellTimeSeconds: 120 }
        });
        const withAll = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), DEFAULT_PARAMS, {
            S1: { dwellTimeSeconds: 120 },
            S2: { dwellTimeSeconds: 120 },
            S3: { dwellTimeSeconds: 120 },
        });
        expect(withAll.totalTimeSeconds).toBeGreaterThan(withOne.totalTimeSeconds);
    });
});

// ---------------------------------------------------------------------------
// runSimulation — parameter sensitivity
// ---------------------------------------------------------------------------

describe('runSimulation – parameter sensitivity', () => {
    it('higher base speed reduces travel time', () => {
        const slow = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), { ...DEFAULT_PARAMS, baseSpeedKmh: 10 });
        const fast = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), { ...DEFAULT_PARAMS, baseSpeedKmh: 30 });
        expect(fast.totalTimeSeconds).toBeLessThan(slow.totalTimeSeconds);
    });

    it('higher dwell time increases total time', () => {
        const quick = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), { ...DEFAULT_PARAMS, dwellTimeSeconds: 10 });
        const slow = runSimulation(FIVE_STOPS, allIds(FIVE_STOPS), { ...DEFAULT_PARAMS, dwellTimeSeconds: 60 });
        expect(slow.totalTimeSeconds).toBeGreaterThan(quick.totalTimeSeconds);
    });
});

// ---------------------------------------------------------------------------
// generatePerformanceData — dynamic route performance
// ---------------------------------------------------------------------------

describe('generatePerformanceData', () => {
    it('produces 24 hourly data points', () => {
        const data = generatePerformanceData(2000, 42);
        expect(data.length).toBe(24);
        expect(data[0].hour).toBe(0);
        expect(data[23].hour).toBe(23);
    });

    it('scheduled time is ~20% above baseline', () => {
        const baseline = 1500;
        const data = generatePerformanceData(baseline, 99);
        for (const d of data) {
            expect(d.scheduledTimeSeconds).toBe(Math.round(baseline * 1.2));
        }
    });

    it('rush hour actual times are higher than late night', () => {
        const data = generatePerformanceData(2000, 7);
        const lateNight = data.find(d => d.hour === 2)!;
        const morningRush = data.find(d => d.hour === 8)!;
        const eveningRush = data.find(d => d.hour === 17)!;
        expect(morningRush.actualTimeSeconds).toBeGreaterThan(lateNight.actualTimeSeconds);
        expect(eveningRush.actualTimeSeconds).toBeGreaterThan(lateNight.actualTimeSeconds);
    });

    it('same seed produces identical results (deterministic)', () => {
        const a = generatePerformanceData(2000, 123);
        const b = generatePerformanceData(2000, 123);
        expect(a).toEqual(b);
    });

    it('different seeds produce different results', () => {
        const a = generatePerformanceData(2000, 1);
        const b = generatePerformanceData(2000, 2);
        // At least one hour should differ
        const differs = a.some((d, i) => d.actualTimeSeconds !== b[i].actualTimeSeconds);
        expect(differs).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// hashRouteId — deterministic hashing
// ---------------------------------------------------------------------------

describe('hashRouteId', () => {
    it('returns a non-negative integer', () => {
        expect(hashRouteId('504')).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(hashRouteId('ROUTE_A'))).toBe(true);
    });

    it('same input yields same output', () => {
        expect(hashRouteId('abc')).toBe(hashRouteId('abc'));
    });

    it('different inputs yield different outputs', () => {
        expect(hashRouteId('504')).not.toBe(hashRouteId('501'));
    });
});
