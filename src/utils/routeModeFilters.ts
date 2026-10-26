import { effectiveMode, knownModeLabel, sortModes } from '../../shared/modes';

export type RouteModeFilterKey = `mode:${number}` | 'subtype:brt' | 'subtype:express';

export interface RouteModeFilterRoute {
  routeShortName: string;
  routeLongName?: string | null;
  routeType?: number | string | null;
  busSubType?: string | null;
  agencySlug: string;
}

export interface HistoryRouteFilter {
  key: RouteModeFilterKey;
  label: string;
  count: number;
}

export function routeModeFilterLabel(route: RouteModeFilterRoute): string | null {
  const mode = effectiveMode(route);
  return mode === 3 ? null : knownModeLabel(mode);
}

export function buildRouteModeFilters(routes: RouteModeFilterRoute[]): HistoryRouteFilter[] {
  const filters: HistoryRouteFilter[] = [];
  const modes = new Map<number, { label: string; count: number }>();

  for (const route of routes) {
    const label = routeModeFilterLabel(route);
    if (!label) continue;
    const mode = effectiveMode(route);
    const current = modes.get(mode);
    modes.set(mode, { label, count: (current?.count ?? 0) + 1 });
  }

  for (const [mode, value] of sortModes(modes.entries(), ([m]) => m)) {
    filters.push({ key: `mode:${mode}`, label: value.label, count: value.count });
  }

  const brtCount = routes.filter(route => route.busSubType === 'brt').length;
  if (brtCount) filters.push({ key: 'subtype:brt', label: 'BRT', count: brtCount });

  const expressCount = routes.filter(route => route.busSubType === 'express').length;
  if (expressCount) filters.push({ key: 'subtype:express', label: 'Express', count: expressCount });

  return filters;
}

export function routeMatchesModeFilter(route: RouteModeFilterRoute, filter: RouteModeFilterKey): boolean {
  if (filter.startsWith('mode:')) return effectiveMode(route) === Number(filter.slice(5));
  if (filter === 'subtype:brt') return route.busSubType === 'brt';
  if (filter === 'subtype:express') return route.busSubType === 'express';
  return true;
}
