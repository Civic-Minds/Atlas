import { applyAnalysisCriteria, EDGE_GAP_ALLOWANCE_MINUTES, determineTierWithEdgeGapAllowance } from '../pipeline/transit-phase2';
import type { AnalysisResult, RawRouteDepartures } from '../types/gtfs';

export function applyEdgeGapCandidateCriteria(rawData: RawRouteDepartures[]): AnalysisResult[] {
  return applyAnalysisCriteria(rawData, undefined, determineTierWithEdgeGapAllowance);
}

export { EDGE_GAP_ALLOWANCE_MINUTES };
