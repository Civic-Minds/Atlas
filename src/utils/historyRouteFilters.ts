import { effectiveMode, GTFS_RAIL_MODE_LABELS, VIRTUAL_LRT_MODE } from '../../shared/modes';
import { titleCase } from './format';

export type HistoryRouteFilterKey = `mode:${number}` | 'subtype:brt' | 'subtype:express';

export interface HistoryRouteFilterRoute {
  routeShortName: string;
  routeLongName?: string | null;
  routeType?: number | string | null;
  busSubType?: string | null;
  agencySlug: string;
}

export interface HistoryRouteFilter {
  key: HistoryRouteFilterKey;
  label: string;
  count: number;
}

export function historyRouteModeLabel(route: HistoryRouteFilterRoute): string | null {
  const mode = effectiveMode(route);
  if (mode === VIRTUAL_LRT_MODE) return 'LRT';
  const label = GTFS_RAIL_MODE_LABELS[mode];
  return label ? titleCase(label) : null;
}

export function buildHistoryRouteFilters(routes: HistoryRouteFilterRoute[]): HistoryRouteFilter[] {
  const filters: HistoryRouteFilter[] = [];
  const modes = new Map<number, { label: string; count: number }>();

  for (const route of routes) {
    const label = historyRouteModeLabel(route);
    if (!label) continue;
    const mode = effectiveMode(route);
    const current = modes.get(mode);
    modes.set(mode, { label, count: (current?.count ?? 0) + 1 });
  }

  for (const [mode, value] of [...modes.entries()].sort((a, b) => b[1].count - a[1].count)) {
    filters.push({ key: `mode:${mode}`, label: value.label, count: value.count });
  }

  const brtCount = routes.filter(route => route.busSubType === 'brt').length;
  if (brtCount) filters.push({ key: 'subtype:brt', label: 'BRT', count: brtCount });

  const expressCount = routes.filter(route => route.busSubType === 'express').length;
  if (expressCount) filters.push({ key: 'subtype:express', label: 'Express', count: expressCount });

  return filters;
}

export function historyRouteMatchesFilter(route: HistoryRouteFilterRoute, filter: HistoryRouteFilterKey): boolean {
  if (filter.startsWith('mode:')) return effectiveMode(route) === Number(filter.slice(5));
  if (filter === 'subtype:brt') return route.busSubType === 'brt';
  if (filter === 'subtype:express') return route.busSubType === 'express';
  return true;
}
