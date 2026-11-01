/**
 * CIV-1074: the periods a row (one headsign's feature) does not run itself: fewer than three of its own
 * departures in the period, counted from its departures per hour (CIV-1010, its own terminal list), while
 * the row would still show a number there (its period value, or the stretch value a variant row reads).
 * The card row reads no regular service for these periods. A row that reads its stretch (main or tail)
 * shows the stretch's departures, so it is never marked here. Display only: no filter value reads this.
 */
import { PERIOD_KEYS, PERIOD_MINUTES, type PeriodKey } from '../shared/config.js';

export const MIN_OWN_DEPARTURES = 3;

/** A row's own departures in a period, from its departures per hour; hours past midnight count in late and overnight. */
export function ownDeparturesInPeriod(departuresByHour: Record<string, number>, period: PeriodKey): number {
  const { start, end } = PERIOD_MINUTES[period];
  let n = 0;
  for (const [hour, count] of Object.entries(departuresByHour)) {
    const h = Number(hour) * 60;
    if ((h >= start && h < end) || (h + 1440 >= start && h + 1440 < end)) n += count;
  }
  return n;
}

export function noOwnServicePeriods(p: {
  departuresByHour?: Record<string, number>;
  headwayByPeriod?: Partial<Record<PeriodKey, number | null>>;
  stretchRole?: string;
  stretchMeta?: { main?: { period?: Partial<Record<PeriodKey, number | null>> } | null } | null;
  noOwnServiceByPeriod?: PeriodKey[];
  stretchPeriodEdge?: Partial<Record<PeriodKey, { stretch?: 'main' | number }>>;
  stretchCovers?: ('main' | number)[];
}): PeriodKey[] {
  const out = new Set<PeriodKey>(p.noOwnServiceByPeriod ?? []);
  if (p.departuresByHour && p.stretchRole !== 'main' && p.stretchRole !== 'tail') {
    for (const pk of PERIOD_KEYS) {
      const shows = p.headwayByPeriod?.[pk] != null || p.stretchMeta?.main?.period?.[pk] != null;
      if (shows && ownDeparturesInPeriod(p.departuresByHour, pk) < MIN_OWN_DEPARTURES) out.add(pk);
    }
  }
  // CIV-1248 (#1277): a period whose edge is read on a stretch the row covers has the edge's own
  // three departures on that stretch, so the row runs there. The terminal list can count fewer when
  // trips reach the terminal after the period ends (TTC 110 Sunday AM to Islington: 7:48, 8:17 and
  // 8:47 arrive 8:08, 8:37 and 9:07).
  for (const pk of PERIOD_KEYS) {
    const stretch = p.stretchPeriodEdge?.[pk]?.stretch;
    if (stretch != null && p.stretchCovers?.includes(stretch)) out.delete(pk);
  }
  return PERIOD_KEYS.filter(pk => out.has(pk));
}
