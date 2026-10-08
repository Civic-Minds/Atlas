import type {
  HeadwayByHourMaxGap,
  HeadwayByPeriod,
  HeadwayByPeriodMaxGap,
  HeadwayByPeriodRange,
  HeadwayByPeriodSustained,
} from './config.js';
import type { RouteDataQualityWarning } from './routeDataQuality.js';

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
  routeDataQualityWarning?: RouteDataQualityWarning;
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
  minStopHeadway?: number;
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  headsignMinStopHeadwayByPeriod?: Partial<Record<string, number>>;
  stopHeadways?: Record<string, number | null>;
  stopPeriodHeadways?: Record<string, HeadwayByPeriod>;
  stopOrder?: string[];
  stopPositions?: number[];
  researchFrequentService?: { daytime15: boolean; daytime30: boolean; extended15: boolean; extended30: boolean };
}
