export interface RouteFeature {
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  headway: number | null;
  headwayByPeriod: Record<string, number | null>;
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

export function fmtHeadway(hw: number | null | undefined): string {
  if (hw == null) return '—';
  if (hw >= 60) return `${Math.round(hw / 60)}h`;
  return `${Math.round(hw)} min`;
}
