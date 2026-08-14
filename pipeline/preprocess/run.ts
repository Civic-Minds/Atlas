import type { GtfsData } from '../../types/gtfs.js';
import { filterGtfsByAgencyId, filterGtfsByExcludedShortNames, filterGtfsByExcludedTripHeadsigns, filterGtfsByRouteTypes } from '../filterGtfs.js';
import { synthesizeMissingDirections, synthesizeTripHeadsigns } from '../synthesize-directions.js';
import { mergeLetterSuffixBranches } from '../transforms/letter-suffix-branches.js';
import { mergeNrtDayNightRoutes, sanitizeNrtFeed } from '../transforms/nrt-day-night.js';
import { synthesizeLondonRouteNames } from '../transforms/london-route-names.js';
import { linkMetrolinkShapes } from '../transforms/metrolink-shapes.js';
import { linkWvuPrtShapes } from '../transforms/wvu-prt-shapes.js';
import { mergeEquivalentShapeVariants } from './merge-equivalent-shapes.js';

export type GtfsPreprocess =
  | 'nrt-day-night'
  | 'nrt-cleanup'
  | 'london-route-names'
  | 'metrolink-shapes'
  | 'wvu-prt-shapes';

export interface GtfsTransformOptions {
  agencyId?: string;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
}

/** Parse → filter → merge branches → agency preprocess → synthesize trip metadata. */
export function normalizeGtfs(
  gtfs: GtfsData,
  options: GtfsTransformOptions | undefined,
  onStatus?: (msg: string) => void,
): GtfsData {
  if (options?.routeTypes?.length) {
    gtfs = filterGtfsByRouteTypes(gtfs, options.routeTypes);
  }
  if (options?.agencyId) {
    gtfs = filterGtfsByAgencyId(gtfs, options.agencyId);
    onStatus?.(`Agency filter: kept agency_id=${options.agencyId}`);
  }
  if (options?.excludeRouteShortNames?.length) {
    gtfs = filterGtfsByExcludedShortNames(gtfs, options.excludeRouteShortNames);
  }
  if (options?.excludeTripHeadsigns?.length) {
    const before = gtfs.trips?.length ?? 0;
    gtfs = filterGtfsByExcludedTripHeadsigns(gtfs, options.excludeTripHeadsigns);
    const removed = before - (gtfs.trips?.length ?? 0);
    if (removed > 0) onStatus?.(`Headsign filter: removed ${removed} non-passenger trip(s)`);
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
  if (options?.preprocess === 'wvu-prt-shapes') {
    const before = gtfs.trips?.filter(trip => trip.shape_id).length ?? 0;
    gtfs = linkWvuPrtShapes(gtfs);
    const after = gtfs.trips?.filter(trip => trip.shape_id).length ?? 0;
    onStatus?.(`WVU PRT shape linkage: ${after - before} trips linked`);
  }
  gtfs = synthesizeTripHeadsigns(gtfs);
  if (options?.mergeEquivalentShapeVariants) {
    const merged = mergeEquivalentShapeVariants(gtfs);
    gtfs = merged.gtfs;
    if (merged.mergedTrips > 0) {
      onStatus?.(
        `Equivalent shape variants: merged ${merged.mergedTrips} platform trips across ${merged.mergedGroups} shape groups`,
      );
    }
  }
  return synthesizeMissingDirections(gtfs);
}
