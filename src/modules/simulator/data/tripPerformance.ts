export interface HourlyPerformance {
  hour: number;
  scheduledTimeSeconds: number;
  actualTimeSeconds: number;
}

export interface RoutePerformance {
  routeId: string;
  data: HourlyPerformance[];
}

/**
 * Generates a realistic performance curve for any route based on its
 * baseline travel time (from the simulation engine). A seeded random
 * generator ensures the same route always produces the same curve
 * within a session, but each route gets a unique profile.
 */
export function generatePerformanceData(
  baselineSeconds: number,
  seed: number = 0
): HourlyPerformance[] {
  const data: HourlyPerformance[] = [];

  // Simple seeded pseudo-random (Mulberry32)
  let state = seed | 0;
  const rand = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let hour = 0; hour < 24; hour++) {
    // Scheduled time has ~20% buffer built in
    const scheduledTime = baselineSeconds * 1.2;

    // Congestion curve: realistic peak/off-peak pattern
    let congestionFactor = 1.0;

    if (hour >= 0 && hour < 5) {
      // Late night — near baseline
      congestionFactor = 1.0 + (rand() * 0.1);
    } else if (hour >= 7 && hour < 10) {
      // Morning Rush
      congestionFactor = 1.6 + (rand() * 0.3);
    } else if (hour >= 16 && hour < 19) {
      // Evening Rush
      congestionFactor = 1.8 + (rand() * 0.4);
    } else if (hour >= 10 && hour < 16) {
      // Midday
      congestionFactor = 1.3 + (rand() * 0.2);
    } else {
      // Late evening / early morning shoulders
      congestionFactor = 1.1 + (rand() * 0.1);
    }

    data.push({
      hour,
      scheduledTimeSeconds: Math.round(scheduledTime),
      actualTimeSeconds: Math.round(baselineSeconds * congestionFactor)
    });
  }

  return data;
}

/**
 * Simple hash function to create a numeric seed from a route ID string.
 * This ensures the same route always gets the same performance curve.
 */
export function hashRouteId(routeId: string): number {
  let hash = 0;
  for (let i = 0; i < routeId.length; i++) {
    const char = routeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Legacy export kept for backward compatibility — now returns an empty map.
// Use generatePerformanceData() directly instead.
export const ROUTE_PERFORMANCE_DATA: Record<string, HourlyPerformance[]> = {};

