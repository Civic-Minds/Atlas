import { describe, expect, it } from 'vitest';
import { aggregateValidationIssues, summarizeCurrentFeed } from '../currentFeedAudit.js';
import type { GtfsData } from '../../types/gtfs.js';

const gtfs: GtfsData = {
  agencies: [{ agency_name: 'Example Transit' }],
  routes: [{ route_id: 'R1', route_type: '3' }],
  trips: [{ route_id: 'R1', service_id: 'WK', trip_id: 'T1' }],
  stops: [{ stop_id: 'S1', stop_name: 'Example', stop_lat: '43.65', stop_lon: '-79.38' }],
  stopTimes: [{ trip_id: 'T1', arrival_time: '08:00:00', departure_time: '08:00:00', stop_id: 'S1', stop_sequence: '1' }],
  calendar: [{ service_id: 'WK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
  calendarDates: [],
  shapes: [],
};

describe('summarizeCurrentFeed', () => {
  it('flags a feed whose stops are entirely outside the configured bbox', () => {
    const finding = summarizeCurrentFeed({
      slug: 'example',
      name: 'Example Transit',
      bbox: [32, -111, 33, -110],
      lastFeedExpiry: '20261231',
    }, Buffer.from('zip'), gtfs);

    expect(finding.agencyNames).toEqual(['Example Transit']);
    expect(finding.expiryMismatch).toBe(false);
    expect(finding.geographyMismatch).toBe(true);
  });
});

describe('aggregateValidationIssues', () => {
  it('aggregates feeds and affected-record counts by validation code', () => {
    const findings = [
      { validation: { issues: [{ code: 'W030', severity: 'warning', count: 4 }] } },
      { validation: { issues: [{ code: 'W030', severity: 'warning', count: 2 }, { code: 'I001', severity: 'info', count: 1 }] } },
    ] as any;

    expect(aggregateValidationIssues(findings)).toEqual({
      W030: { severity: 'warning', feeds: 2, occurrences: 6 },
      I001: { severity: 'info', feeds: 1, occurrences: 1 },
    });
  });
});
