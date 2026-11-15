import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { summaryTimetable } from '../live-agency-summary';

const feed = (dir: string) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'routes.txt'), 'route_id,route_short_name\n1,504\n'); };

describe('the agency summary finds its timetable (#1491)', () => {
  it('reads surface/ when it holds a timetable', () => {
    const d = mkdtempSync(join(tmpdir(), 'live-summary-'));
    feed(join(d, 'gtfs/candidates/surface'));
    feed(join(d, 'gtfs/candidates/surface-feeds/2026-11-01'));
    expect(summaryTimetable(d)).toBe(join(d, 'gtfs/candidates/surface'));
  });
  it('otherwise reads the newest feed under surface-feeds/', () => {
    const d = mkdtempSync(join(tmpdir(), 'live-summary-'));
    feed(join(d, 'gtfs/candidates/surface-feeds/2026-09-30'));
    feed(join(d, 'gtfs/candidates/surface-feeds/2026-11-01'));
    mkdirSync(join(d, 'gtfs/candidates/surface-feeds/2026-12-01'), { recursive: true });
    expect(summaryTimetable(d)).toBe(join(d, 'gtfs/candidates/surface-feeds/2026-11-01'));
  });
});
