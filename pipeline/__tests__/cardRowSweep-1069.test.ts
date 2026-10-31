/**
 * CIV-1069 step 3: a sweep over every standalone fixture, through the route card's own rows (buildDirectionGroups,
 * routeCardRowValue) and their trips (rowTrips). Only what a card row shows counts.
 * - No row shows a number when its headsign runs fewer than 3 times itself in the period, unless the row reads its
 *   stretch (a main or tail slot, whose value is every trip of the stretch, CIV-939).
 * - No row shows a plain number beside a longest gap of half the period or more and at least twice the number: such a
 *   period reads its late start, early end or one gap in words (partPeriod), or no regular cadence.
 * Today's cases are pinned in the snapshot (pipeline follow-ups); a new one changes it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';
import { applyAgencySections, type AgencySections } from '../../shared/agencySections.js';
import { PERIOD_KEYS, PERIOD_MINUTES } from '../../shared/config.js';
import { rowTrips } from '../../src/utils/rowTrips.js';
import { hasStretchRoles, routeContract } from '../../src/utils/stretchCard.js';
import { routeCardRowValue } from '../../src/utils/routeCardRowValue.js';
import { buildDirectionGroups } from '../../src/utils/routeCardDirectionGroups.js';
import type { ShapeProperties } from '../../src/hooks/useIntervalStats.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
/** The fewest of a headsign's own departures a period value may read (noOwnServiceByPeriod's own threshold). */
const MIN_OWN_DEPARTURES = 3;

function csvColumn(file: string, column: string): string[] {
  if (!existsSync(file)) return [];
  const [header, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/);
  const index = header.split(',').indexOf(column);
  return index < 0 ? [] : lines.map(line => line.split(',')[index]).filter(Boolean);
}

/** The pin test's clock: a Wednesday near the middle of the fixture's service dates. */
function referenceDate(dir: string): Date {
  const dates = [...csvColumn(join(dir, 'calendar.txt'), 'start_date'), ...csvColumn(join(dir, 'calendar.txt'), 'end_date'), ...csvColumn(join(dir, 'calendar_dates.txt'), 'date')].sort();
  const pick = dates[Math.floor(dates.length / 2)] ?? '20260304';
  const day = new Date(`${pick.slice(0, 4)}-${pick.slice(4, 6)}-${pick.slice(6, 8)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((3 - day.getUTCDay() + 7) % 7));
  return day;
}

async function zipDir(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(join(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A headsign's own departures in a period, from its departures per hour (CIV-1010). Undefined on data without them. */
function ownDepartures(p: ShapeProperties, period: (typeof PERIOD_KEYS)[number]): number | undefined {
  if (!p.departuresByHour) return undefined;
  const { start, end } = PERIOD_MINUTES[period];
  let n = 0;
  for (const [hour, count] of Object.entries(p.departuresByHour)) {
    const h = Number(hour) * 60;
    if ((h >= start && h < end) || (h + 1440 >= start && h + 1440 < end)) n += count;
  }
  return n;
}

const fixtureNames = readdirSync(FIXTURES)
  .filter(name => existsSync(join(FIXTURES, name, 'stop_times.txt')) && existsSync(join(FIXTURES, name, 'trips.txt')))
  .sort();

describe('card rows read their value, gap and words from the same trips, across every fixture (CIV-1069)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterAll(() => { vi.useRealTimers(); });

  it('no number from fewer than 3 own departures, and no plain number beside a gap of half the period or more', async () => {
    const borrowed: string[] = [];
    const holes: string[] = [];
    for (const name of fixtureNames) {
      const dir = join(FIXTURES, name);
      vi.setSystemTime(referenceDate(dir));
      let result;
      try { result = await processAgencyFeeds(await zipDir(dir), [], { slug: name } as never); } catch { continue; }
      const features = applyAgencySections(JSON.parse(result.geojson).features, JSON.parse(result.sectionsJson) as AgencySections);
      // Each route-day as the route card builds it: its rows, and what each row shows.
      const routes = new Map<string, ShapeProperties[]>();
      for (const f of features) {
        const p = f.properties as unknown as ShapeProperties & { stopId?: string };
        if (!p || p.stopId != null || !p.routeId) continue;
        const key = `${p.routeId}|${p.day}`;
        routes.set(key, [...(routes.get(key) ?? []), p]);
      }
      for (const directions of routes.values()) {
        const stretchMode = hasStretchRoles(directions);
        for (const period of PERIOD_KEYS) {
          const contract = routeContract(directions, period);
          const noRegularService = contract != null && contract.filterValue == null && contract.runs;
          // The card shows no rows for a period the route does not run in (RouteCardHeadway's doesNotRun).
          if (contract != null && contract.filterValue == null && !contract.runs) continue;
          for (const group of buildDirectionGroups({ directions }, period)) {
            for (const p of group.realTier) {
              const shown = routeCardRowValue(p, { period, hoveredHour: null, stretchMode, contract, noRegularService, maxHeadway: Infinity });
              if (shown.headway == null) continue;
              const trips = rowTrips(p, period);
              const where = `${name} ${p.routeShortName || p.routeId} ${p.day} d${p.directionId} "${p.headsign}" ${period}`;
              const own = ownDepartures(p, period);
              const readsStretch = p.stretchRole === 'main' || p.stretchRole === 'tail';
              if (own !== undefined && own < MIN_OWN_DEPARTURES && !readsStretch) borrowed.push(`${where}: every ${shown.headway} from ${own} own`);
              const { start, end } = PERIOD_MINUTES[period];
              // "Beside a frequent number": the gap is half the period or more and at least twice the number shown (a slow route
              // whose number is its gap is not a contradiction), with no words in place of the number.
              if (!shown.headwayLabel && trips.longestGap != null && trips.longestGap >= (end - start) / 2 && trips.longestGap >= 2 * shown.headway) holes.push(`${where}: every ${shown.headway} beside ${trips.longestGap}`);
            }
          }
        }
      }
    }
    // The known cases, pinned until the pipeline reads them (CIV-1069 follow-ups); a new one fails here for review.
    expect({ borrowed, holes }).toMatchSnapshot();
  }, 600_000);
});
