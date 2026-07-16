import type { GtfsData } from '../../types/gtfs.js';
import { filterGtfsByExcludedShortNames, filterGtfsByRouteTypes } from '../filterGtfs.js';
import { synthesizeMissingDirections } from '../synthesize-directions.js';
import { mergeLetterSuffixBranches } from '../transforms/letter-suffix-branches.js';
import { mergeNrtDayNightRoutes, sanitizeNrtFeed } from '../transforms/nrt-day-night.js';
import { synthesizeLondonRouteNames } from '../transforms/london-route-names.js';
import { linkMetrolinkShapes } from '../transforms/metrolink-shapes.js';

export type GtfsPreprocess = 'nrt-day-night' | 'nrt-cleanup' | 'london-route-names' | 'metrolink-shapes';

export interface GtfsTransformOptions {
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  skipLetterSuffixMerge?: boolean;
}

/** Parse → filter → merge branches → agency preprocess → synthesize directions. */
export function normalizeGtfs(
  gtfs: GtfsData,
  options: GtfsTransformOptions | undefined,
  onStatus?: (msg: string) => void,
): GtfsData {
  if (options?.routeTypes?.length) {
    gtfs = filterGtfsByRouteTypes(gtfs, options.routeTypes);
  }
  if (options?.excludeRouteShortNames?.length) {
    gtfs = filterGtfsByExcludedShortNames(gtfs, options.excludeRouteShortNames);
  }
  if (!options?.skipLetterSuffixMerge) {
    const { gtfs: merged, result } = mergeLetterSuffixBranches(gtfs);
    gtfs = merged;
    if (result.mergedPairs.length > 0) {
      onStatus?.(
        `Letter-suffix branch merge: ${result.mergedPairs.length} pairs, ${result.tripsReassigned} trips reassigned`,
      );
    }
  }
  if (options?.preprocess === 'nrt-day-night') {
    const { gtfs: merged, result } = mergeNrtDayNightRoutes(gtfs);
    gtfs = merged;
    onStatus?.(
      `NRT day/night merge: ${result.mergedPairs.length} pairs, ${result.tripsReassigned} trips reassigned` +
        (result.shortTurnTripsDropped ? `, ${result.shortTurnTripsDropped} short-turn artifacts removed` : '') +
        (result.orphanEveRoutes.length ? `, ${result.orphanEveRoutes.length} unmatched 4xx` : '') +
        (result.shapeWarnings.length ? `, ${result.shapeWarnings.length} shape warnings` : ''),
    );
    for (const warning of result.shapeWarnings) {
      onStatus?.(`NRT shape audit: ${warning}`);
    }
  }
  if (options?.preprocess === 'nrt-cleanup') {
    const { gtfs: cleaned, result } = sanitizeNrtFeed(gtfs);
    gtfs = cleaned;
    onStatus?.(
      `NRT cleanup: ${result.shortTurnTripsDropped} malformed short-turn artifacts removed; day/night route numbers preserved`,
    );
  }
  if (options?.preprocess === 'london-route-names') {
    gtfs = synthesizeLondonRouteNames(gtfs);
    onStatus?.('Synthesized descriptive route long names from trip headsigns');
  }
  if (options?.preprocess === 'metrolink-shapes') {
    const before = gtfs.trips?.filter(trip => trip.shape_id).length ?? 0;
    gtfs = linkMetrolinkShapes(gtfs);
    const after = gtfs.trips?.filter(trip => trip.shape_id).length ?? 0;
    onStatus?.(`Metrolink shape linkage: ${after - before} trips linked`);
  }
  return synthesizeMissingDirections(gtfs);
}
