export interface AuditedStop {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  routes: string[];
}

export interface StopAuditResult {
  added: number;
  removed: number;
  renamed: number;
  moved: number;
  routeChanges: number;
  totalPrevious: number;
  totalCurrent: number;
}

const MOVE_THRESHOLD_M = 100;

function distanceM(a: AuditedStop, b: AuditedStop): number | null {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const lat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = dLon * Math.cos(lat);
  return 6_371_000 * Math.sqrt(dLat * dLat + x * x);
}

export function compareStopSnapshots(previous: AuditedStop[], current: AuditedStop[]): StopAuditResult {
  const before = new Map(previous.map(stop => [stop.id, stop]));
  const after = new Map(current.map(stop => [stop.id, stop]));
  let renamed = 0;
  let moved = 0;
  let routeChanges = 0;

  for (const [id, next] of after) {
    const prior = before.get(id);
    if (!prior) continue;
    if (prior.name !== next.name) renamed++;
    if ((distanceM(prior, next) ?? 0) >= MOVE_THRESHOLD_M) moved++;
    if (prior.routes.join('\u001f') !== next.routes.join('\u001f')) routeChanges++;
  }

  return {
    added: current.filter(stop => !before.has(stop.id)).length,
    removed: previous.filter(stop => !after.has(stop.id)).length,
    renamed,
    moved,
    routeChanges,
    totalPrevious: previous.length,
    totalCurrent: current.length,
  };
}

export function formatStopAuditLog(slug: string, result: StopAuditResult): string {
  return `[stops] ${slug}: ${result.totalCurrent} current vs ${result.totalPrevious} previous; ` +
    `added ${result.added}, removed ${result.removed}, renamed ${result.renamed}, ` +
    `moved ${result.moved}, route changes ${result.routeChanges}`;
}

