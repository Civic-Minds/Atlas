/**
 * Calculates the Haversine distance between two points in meters.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Compass bearing (0-360, 0 = north) from one point to another.
 */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const x = Math.sin(deltaLambda) * Math.cos(phi2);
    const y = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const theta = (Math.atan2(x, y) * 180) / Math.PI;
    return (theta + 360) % 360;
}

/** Smallest angle between two compass bearings, 0-180. */
export function bearingDiff(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
}

/**
 * Formats seconds into a human-readable duration string.
 */
export function formatTime(seconds: number): string {
    const totalSeconds = Math.round(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
        return `${hrs}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

/**
 * Formats meters into a human-readable distance string.
 */
export function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

/** UTC calendar date (YYYY-MM-DD) for index.json lastRefreshedAt. */
export function todayUtcYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Run a list of asynchronous tasks with a maximum concurrency.
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runTask(taskIndex: number): Promise<void> {
    const task = tasks[taskIndex];
    results[taskIndex] = await task();
  }

  const enqueue = async (): Promise<void> => {
    if (index === tasks.length) return;
    const currentIdx = index++;
    await runTask(currentIdx);
    await enqueue();
  };

  const initialPromises: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    initialPromises.push(enqueue());
  }
  await Promise.all(initialPromises);
  return results;
}

