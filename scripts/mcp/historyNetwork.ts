/**
 * CIV-3206: builds an agency's History network file (shared/historyNetwork.ts) with History's own year-view functions:
 * routesForYear picks each route's schedule for the year (carrying an older one where History does), and
 * historyDayPeriodValue reads its figure on a day in a part of the day.
 */
import { PERIOD_KEYS } from '../../shared/config';
import { DAY_TYPES, type DayType } from '../../shared/rules/days';
import { routesForYear, yearsAvailable, type HistoryRouteLike, type HistorySnapshotLike } from '../../shared/historyV2Reader';
import type { HistoryNetwork, NetworkCell } from '../../shared/historyNetwork';
import type { McpHistoryAgency } from '../../shared/mcpStore';
import { historyDayPeriodValue, passesHistoryLimit } from '../../src/utils/historyYearMap';
import { usableSnapshots } from '../../src/utils/historySnapshots';
import type { SnapshotValue } from '../../shared/historyV2Reader';

type Snap = HistorySnapshotLike & Record<string, unknown>;

export function buildHistoryNetwork(agency: McpHistoryAgency): HistoryNetwork {
  // The snapshots History shows (usableSnapshots), as History.tsx reads them.
  const routes = agency.routes.map(r => ({ ...r, snapshots: usableSnapshots(r.snapshots as unknown as Snap[]) })) as Array<HistoryRouteLike<Snap> & { routeShortName: string; routeName?: string }>;
  const view = { routes, coverageYears: agency.coverageYears };
  const years = agency.coverageYears?.length ? [...agency.coverageYears].sort((a, b) => a - b) : yearsAvailable(view);
  const index = new Map(routes.map((r, i) => [r, i]));
  const byYear: HistoryNetwork['byYear'] = {};
  for (const year of years) {
    byYear[year] = routesForYear<Snap, typeof routes[number]>(view, year).map(({ route, snapshot, carriedFrom }) => {
      const days: Partial<Record<DayType, NetworkCell[]>> = {};
      for (const day of DAY_TYPES) {
        const cells = PERIOD_KEYS.map(k => cellOf(historyDayPeriodValue(snapshot as never, day, k)));
        if (cells.some(c => c != null)) days[day] = cells;
      }
      return [index.get(route)!, carriedFrom ?? null, days];
    });
  }
  return { v: 1, years, routes: routes.map(r => [r.routeShortName, r.routeName ?? null]), byYear };
}

const cellOf = (v: SnapshotValue): NetworkCell => (v.kind === 'value' ? v.min : v.kind === 'none' ? 'none' : v.kind === 'limited' ? 'limited' : null);
/** A cell back to History's value, for passesHistoryLimit. */
export const valueOf = (c: NetworkCell | undefined): SnapshotValue => (typeof c === 'number' ? { kind: 'value', min: c } : c === 'none' ? { kind: 'none' } : c === 'limited' ? { kind: 'limited' } : { kind: 'blank' });
export { passesHistoryLimit };
