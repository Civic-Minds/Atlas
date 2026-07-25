import type { HeadwayByPeriod } from '../../shared/config';

export interface RouteFeature {
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  headway: number | null;
  headwayByPeriod: HeadwayByPeriod;
  fromStopHeadwayByPeriod: Record<string, number | null>;
  toStopHeadway: number | null;
  toStopHeadwayByPeriod: Record<string, number | null>;
  color: string;
  stopOrder: string[];
  coordinates?: number[][];
}

export interface RouteGroup {
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  color: string;
  branches: RouteFeature[];
  bestHeadway: number | null;
}

export { fmtHeadway } from '../utils/format';
