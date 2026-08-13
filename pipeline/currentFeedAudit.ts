import { createHash } from 'node:crypto';
import type { GtfsData } from '../types/gtfs.js';
import { effectiveFeedExpiry } from './feedFreshness.js';
import { validateGtfs, type ValidationIssue, type ValidationReport } from './validation.js';

export interface CurrentFeedAgency {
  slug: string;
  name?: string;
  bbox?: [number, number, number, number] | null;
  lastFeedExpiry?: string | null;
}

export interface CurrentFeedFinding {
  slug: string;
  hash: string;
  agencyNames: string[];
  routeCount: number;
  tripCount: number;
  stopCount: number;
  shapeCount: number;
  feedExpiry: string | null;
  registryExpiry: string | null;
  expiryMismatch: boolean;
  geographyMismatch: boolean;
  shapeAnomalies: {
    total: number;
    truncated: number;
    deinterleaved: number;
    clusteredJumps: number;
    repairedClusteredJumps: number;
    knownIsolatedPointFixed: number;
  };
  validation: Pick<ValidationReport, 'errors' | 'warnings' | 'infos' | 'issues'>;
}

function feedExpiry(gtfs: GtfsData): string | null {
  return effectiveFeedExpiry({
    feedInfoEnd: gtfs.feedInfo?.map(info => info.feed_end_date ?? null).find(Boolean) ?? null,
    calendarEnds: gtfs.calendar?.map(calendar => calendar.end_date) ?? [],
    calendarDates: gtfs.calendarDates,
  });
}

function geographyMismatch(gtfs: GtfsData, bbox: CurrentFeedAgency['bbox']): boolean {
  if (!bbox || bbox.length !== 4) return false;
  const [south, west, north, east] = bbox;
  const coordinates = gtfs.stops
    .map(stop => [Number(stop.stop_lat), Number(stop.stop_lon)] as const)
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  return coordinates.length > 0 && coordinates.every(([lat, lon]) =>
    lat < south || lat > north || lon < west || lon > east
  );
}

export function summarizeCurrentFeed(
  agency: CurrentFeedAgency,
  buffer: Buffer,
  gtfs: GtfsData,
  validation: ValidationReport = validateGtfs(gtfs, agency.name ?? agency.slug),
): CurrentFeedFinding {
  const anomalies = gtfs.shapeAnomalies ?? [];
  const hash = createHash('sha256').update(buffer).digest('hex');
  const actualExpiry = feedExpiry(gtfs);
  return {
    slug: agency.slug,
    hash,
    agencyNames: [...new Set(gtfs.agencies.map(entry => entry.agency_name).filter(Boolean))],
    routeCount: gtfs.routes.length,
    tripCount: gtfs.trips.length,
    stopCount: gtfs.stops.length,
    shapeCount: gtfs.shapes.length,
    feedExpiry: actualExpiry,
    registryExpiry: agency.lastFeedExpiry ?? null,
    expiryMismatch: actualExpiry !== (agency.lastFeedExpiry ?? null),
    geographyMismatch: geographyMismatch(gtfs, agency.bbox),
    shapeAnomalies: {
      total: anomalies.length,
      truncated: anomalies.filter(anomaly => anomaly.truncated).length,
      deinterleaved: anomalies.filter(anomaly => anomaly.deinterleaved).length,
      clusteredJumps: anomalies.filter(anomaly => anomaly.clusteredJumps).length,
      repairedClusteredJumps: anomalies.filter(anomaly => anomaly.repairedClusteredJumps).length,
      knownIsolatedPointFixed: anomalies.filter(anomaly => anomaly.knownIsolatedPointFixed).length,
    },
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      infos: validation.infos,
      issues: validation.issues,
    },
  };
}

export function aggregateValidationIssues(findings: CurrentFeedFinding[]): Record<string, {
  severity: ValidationIssue['severity'];
  feeds: number;
  occurrences: number;
}> {
  const aggregate: Record<string, { severity: ValidationIssue['severity']; feeds: number; occurrences: number }> = {};
  for (const finding of findings) {
    for (const issue of finding.validation.issues) {
      const current = aggregate[issue.code];
      if (current) {
        current.feeds += 1;
        current.occurrences += issue.count ?? 1;
      } else {
        aggregate[issue.code] = {
          severity: issue.severity,
          feeds: 1,
          occurrences: issue.count ?? 1,
        };
      }
    }
  }
  return aggregate;
}
