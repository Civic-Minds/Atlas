import type {
  PeriodKey,
  HeadwayByHourMaxGap,
  HeadwayByPeriod,
  HeadwayByPeriodMaxGap,
  HeadwayByPeriodRange,
  HeadwayByPeriodSustained,
} from './config.js';
import type { RouteDataQualityWarning } from './routeDataQuality.js';
import type { SharedStop, SharedStretch } from './sharedStops.js';

export type HeadwayByHour = Partial<Record<number, number | null>>;

/** Published route-feature properties shared by the pipeline and clients. */
export interface RouteProperties {
  routeId: string;
  routeBranch?: string | null;
  directionId: number;
  tier: string | null;
  weekdayTierVariation?: boolean;
  edgeGapAllowance?: 'opening' | 'closing' | 'both';
  serviceClass?: 'regular' | 'time-limited' | 'irregular';
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
  headwayRangeByPeriod?: HeadwayByPeriodRange;
  maxGapByPeriod?: HeadwayByPeriodMaxGap;
  headwayByPeriodSustained?: HeadwayByPeriodSustained;
  /** Partial-weekday routes (#710): periods with service on the weekdays the route runs. */
  partialWeekdayServiceByPeriod?: HeadwayByPeriodSustained;
  routeDataQualityWarning?: RouteDataQualityWarning;
  /** The feed has schedule data for this route but no usable line geometry. */
  noRouteShape?: boolean;
  headwayByHour?: HeadwayByHour;
  maxGapByHour?: HeadwayByHourMaxGap;
  routeShortName: string | null;
  routeLongName: string | null;
  routeVariant?: string | null;
  agencyName?: string;
  headsign?: string | null;
  busSubType?: 'brt' | 'express' | 'coach' | 'local';
  worstDirectionHeadway?: number;
  worstDirectionHeadwayByPeriod?: HeadwayByPeriod;
  periodCoverageHeadway?: HeadwayByPeriod;
  worstDirectionPeriodCoverageHeadway?: HeadwayByPeriod;
  stopPeriodCoverageHeadways?: Record<string, HeadwayByPeriod>;
  routeHasIrregularDirection?: boolean;
  routeHasLimitedDirection?: boolean;
  /** #899: the all-day filter cap from a direction with little or no midday service (worstDirection.ts). */
  worstDirectionMiddayCap?: number;
  minStopHeadway?: number;
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  headsignMinStopHeadwayByPeriod?: Partial<Record<string, number>>;
  stopHeadways?: Record<string, number | null>;
  /** CIV-152: each drawn stop's every-gap tier on its pooled list (the route tier's method); stops with no all-day reading are absent. */
  stopTiers?: Record<string, string>;
  /** #879: drawn stops with no boardable stop time (pickup_type 1 on every visit); never graded, coloured from their neighbours. */
  dropOffOnlyStops?: string[];
  stopPeriodHeadways?: Record<string, HeadwayByPeriod>;
  stopOrder?: string[];
  stopPositions?: number[];
  /**
   * Shared stretches (CIV-82): stopOrder index ranges where this pattern shares stops with other
   * patterns of the same route, direction and day and a pooled value applies. Agency JSON only.
   */
  sharedStretches?: SharedStretch[];
  /** Pooled values per stop for the whole route/direction/day, on one carrier feature. Read via getPooledStop. */
  sharedStops?: Record<string, SharedStop>;
  /**
   * Frequency focus (pipeline/tripSets.ts), agency JSON only. Filter-agreeing fields: stamped on every feature of a route-day
   * or on none; cards and lists show these so they never disagree with the map's filter. A period's null means no regular
   * service there ("no regular service", never a number).
   */
  routeFilterHeadwayByPeriod?: Partial<Record<PeriodKey, number | null>>;
  /** Whether the route runs in the period at all (the "All" level). */
  routeRunsByPeriod?: Partial<Record<PeriodKey, boolean>>;
  /** Each direction's own filter value. */
  directionFilterHeadwayByPeriod?: Partial<Record<PeriodKey, number | null>>;
  /** The route's range, [best stretch, worst] ("every 8–25"); null: one number. Display only. */
  stretchPeriodRange?: Partial<Record<PeriodKey, [number, number] | null>>;
  /** What this feature is on the card: the direction's main stretch, a tail, or a variant (a short turn: no destination row). */
  stretchRole?: 'main' | 'tail' | 'variant';
  /** 0 for the main stretch; a tail's index into stretchMeta.tails. Absent for variants. */
  stretchIndex?: number;
  stretchMeta?: { main: { stops: number; refStop: string; trips: number } | null; tails: Array<{ refStop: string; stops: number; km: number; trips: number }> };
  /** Night service runs on only part of the route: draw and name only these stops' segments ("part of the route"). */
  nightServicePartOfRoute?: boolean;
  nightServiceStops?: string[];
  researchFrequentService?: { daytime15: boolean; daytime30: boolean; extended15: boolean; extended30: boolean };
}
