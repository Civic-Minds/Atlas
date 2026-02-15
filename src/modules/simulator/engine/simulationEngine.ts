// Simulation Engine — Pure math, no UI
// Computes travel time and metrics given a set of enabled stops and parameters

import { Stop } from '../data/routeData';
import { haversineDistance, formatTime, formatDistance } from '../../../core/utils';

export interface StopOverride {
    dwellTimeSeconds?: number;
    accelPenaltySeconds?: number;
}

export interface SimulationParams {
    baseSpeedKmh: number;      // Average cruising speed in km/h (default 16)
    dwellTimeSeconds: number;   // Time spent at each non-terminal stop (default 20)
    accelPenaltySeconds: number; // Time lost accelerating/decelerating at each stop (default 15)
    terminalDwellSeconds: number; // Time at terminal stops (default 60)
}

export interface SimulationResult {
    totalTimeSeconds: number;
    formattedTime: string;      // Added for UI convenience
    totalDistanceMeters: number;
    averageSpeedKmh: number;
    numberOfStops: number;
    stopsRemoved: number;
    timeSavedSeconds: number;
    maxGapMeters: number;       // Renamed for UI property match
    maxWalkingGapStops: [string, string]; // Names of the two stops forming the longest gap
    timePerStopSeconds: number; // Added for UI property match
    segmentTimes: SegmentResult[];
}

export interface SegmentResult {
    fromStop: string;
    toStop: string;
    distanceMeters: number;
    travelTimeSeconds: number;
}

export const DEFAULT_PARAMS: SimulationParams = {
    baseSpeedKmh: 16,
    dwellTimeSeconds: 20,
    accelPenaltySeconds: 15,
    terminalDwellSeconds: 60,
};

export function runSimulation(
    allStops: Stop[],
    enabledStopIds: Set<string>,
    params: SimulationParams,
    stopOverrides: Record<string, StopOverride> = {}
): SimulationResult {
    // Filter to enabled stops only, maintaining order
    const activeStops = allStops.filter(s => enabledStopIds.has(s.id));

    if (activeStops.length < 2) {
        return {
            totalTimeSeconds: 0,
            formattedTime: '0s',
            totalDistanceMeters: 0,
            averageSpeedKmh: 0,
            numberOfStops: activeStops.length,
            stopsRemoved: allStops.length - activeStops.length,
            timeSavedSeconds: 0,
            maxGapMeters: 0,
            maxWalkingGapStops: ['', ''],
            timePerStopSeconds: 0,
            segmentTimes: [],
        };
    }

    const baseSpeedMs = (params.baseSpeedKmh * 1000) / 3600; // Convert to m/s
    let totalTime = 0;
    let totalDistance = 0;
    let maxGap = 0;
    let maxGapStops: [string, string] = [activeStops[0].name, activeStops[1]?.name || ''];
    const segmentTimes: SegmentResult[] = [];

    for (let i = 1; i < activeStops.length; i++) {
        const from = activeStops[i - 1];
        const to = activeStops[i];
        const dist = haversineDistance(from.lat, from.lng, to.lat, to.lng);

        // Travel time for this segment
        const travelTime = dist / baseSpeedMs;

        totalDistance += dist;
        totalTime += travelTime;

        segmentTimes.push({
            fromStop: from.name,
            toStop: to.name,
            distanceMeters: dist,
            travelTimeSeconds: travelTime,
        });

        // Track max walking gap
        if (dist > maxGap) {
            maxGap = dist;
            maxGapStops = [from.name, to.name];
        }
    }

    // Add dwell time at each non-terminal stop
    for (const stop of activeStops) {
        const override = stopOverrides[stop.id];
        if (stop.isTerminal) {
            totalTime += params.terminalDwellSeconds;
        } else {
            totalTime += override?.dwellTimeSeconds ?? params.dwellTimeSeconds;
            totalTime += override?.accelPenaltySeconds ?? params.accelPenaltySeconds;
        }
    }

    // Calculate baseline for comparison (all stops enabled)
    // We avoid recursion by passing true to a helper or just checking length
    const isBaselineRequest = activeStops.length === allStops.length;

    // Note: timeSaved is relative to the baseline with SAME parameters
    const baselineTime = isBaselineRequest
        ? totalTime
        : calculateSimpleTime(allStops, params, stopOverrides);

    const timeSaved = baselineTime - totalTime;

    const averageSpeed = totalTime > 0
        ? (totalDistance / 1000) / (totalTime / 3600)
        : 0;

    return {
        totalTimeSeconds: totalTime,
        formattedTime: formatTime(totalTime),
        totalDistanceMeters: totalDistance,
        averageSpeedKmh: Math.round(averageSpeed * 10) / 10,
        numberOfStops: activeStops.length,
        stopsRemoved: allStops.length - activeStops.length,
        timeSavedSeconds: Math.round(timeSaved),
        maxGapMeters: Math.round(maxGap),
        maxWalkingGapStops: maxGapStops,
        timePerStopSeconds: Math.round(params.dwellTimeSeconds + params.accelPenaltySeconds),
        segmentTimes,
    };
}

// Simplified time calculator to avoid circular recursion in runSimulation
function calculateSimpleTime(stops: Stop[], params: SimulationParams, stopOverrides: Record<string, StopOverride> = {}): number {
    const baseSpeedMs = (params.baseSpeedKmh * 1000) / 3600;
    let time = 0;
    for (let i = 1; i < stops.length; i++) {
        const dist = haversineDistance(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
        time += dist / baseSpeedMs;
    }
    for (const stop of stops) {
        const override = stopOverrides[stop.id];
        if (stop.isTerminal) time += params.terminalDwellSeconds;
        else {
            time += override?.dwellTimeSeconds ?? params.dwellTimeSeconds;
            time += override?.accelPenaltySeconds ?? params.accelPenaltySeconds;
        }
    }
    return time;
}

