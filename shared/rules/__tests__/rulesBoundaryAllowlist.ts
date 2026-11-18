/**
 * Today's known copies of rule values outside shared/rules/, by file and kind, with how many each file has (rules
 * audit 4.2). Seeded on 2026-11-17 so the boundary test lands green. The list may only shrink: a file with more than
 * its count fails (a new copy), and a file with fewer fails until its count here is lowered or its row deleted.
 */
import type { RuleKind } from './rulesBoundaryScan';

/** Why each kind is still allowed, and which audit step moves it into shared/rules/. */
export const KIND_REASONS: Record<RuleKind, string> = {
  'definition': "a rule constant or type defined outside shared/rules (moves with its kind)",
  'scale-array': "a frequency scale typed by hand (step 1, frequency scales)",
  'grace-formula': "the grace formula typed by hand (step 1)",
  'period-minutes': "a period window in minutes (step 4, periods)",
  'route-type-digit': "a route_type compared to a bare digit; move 9 named them all (ROUTE_TYPE in shared/rules/modes.ts), so none is allowed",
  'origin': "a site or R2 origin typed by hand (step 6, paths)",
  'colour': "a colour typed by hand: a one-use local palette (export theme, context ramps, story maps, debug) or a copy of a CSS token MapLibre can't read (move 8 left these)",
  'min-sample': "a minimum sample of 30 typed by hand (step 2, Live thresholds)",
  'earth-radius': "the earth's radius typed by hand (step 7, limits)",
};

export const KNOWN_COPIES: Record<string, Partial<Record<RuleKind, number>>> = {
  'index.html': { 'origin': 9 },
  'pipeline/defaults.ts': { 'period-minutes': 1 },
  'pipeline/discover-gaps.ts': { 'period-minutes': 2 },
  'pipeline/feedReview.ts': { 'definition': 1 },
  'pipeline/headway-utils.ts': { 'definition': 1, 'period-minutes': 2 },
  'pipeline/overnightTerminal.ts': { 'period-minutes': 3 },
  'pipeline/process-core.ts': { 'period-minutes': 1 },
  'pipeline/route-report.ts': { 'definition': 1 },
  'pipeline/tripSets.ts': { 'definition': 1, 'period-minutes': 1 },
  'scripts/audit-edge-gap-amounts.ts': { 'grace-formula': 2, 'period-minutes': 1 },
  'scripts/audit-edge-gap-impact.ts': { 'grace-formula': 1, 'period-minutes': 1 },
  'scripts/audit-edge-transition-sample.ts': { 'grace-formula': 1 },
  'scripts/audit-edge-transition-terminal.ts': { 'grace-formula': 1 },
  'scripts/audit-frequency-bias.ts': { 'period-minutes': 1 },
  'scripts/audit-frequency-candidates.ts': { 'grace-formula': 1, 'period-minutes': 1 },
  'scripts/audit-frequency.ts': { 'period-minutes': 1 },
  // Move 9 left this drifted rail set as it is (audit section 5 item 3: it leaves out light rail and the overrides).
  'scripts/audit-shape-share.ts': { 'definition': 1 },
  'scripts/build-frequent-weekend-counts.ts': { 'scale-array': 1 },
  'scripts/build-share-maps.ts': { 'colour': 2 },
  'scripts/check-logo-icon.mjs': { 'colour': 1, 'scale-array': 1 },
  'scripts/live-gtfs-for-window.ts': { 'min-sample': 1 },
  'scripts/live-segment-delay.ts': { 'min-sample': 1 },
  'scripts/planner-pictures/capture.mts': { 'colour': 2 },
  'scripts/research-fares.mjs': { 'origin': 1 },
  'scripts/verify-deployments.mjs': { 'origin': 3 },
  'shared/config.ts': { 'definition': 6 },
  'shared/connections.ts': { 'scale-array': 1 },
  // CIV-1814: the night and frequent-service grades' one home each, replacing four typed copies; they move with step 1.
  'shared/frequentService.ts': { 'scale-array': 1 },
  'shared/frequencyRules.ts': { 'definition': 2, 'period-minutes': 1, 'scale-array': 2 },
  'shared/liveDashboard.ts': { 'min-sample': 5 },
  'shared/liveWording.ts': { 'definition': 1 },
  'shared/nightService.ts': { 'scale-array': 1 },
  'shared/stopDelay.ts': { 'definition': 1 },
  'src/apps/AirportStory.tsx': { 'period-minutes': 1 },
  'src/apps/FrequentServiceStory.tsx': { 'scale-array': 1 },
  'src/components/AirportStoryMap.tsx': { 'colour': 6 },
  'src/components/Interval/MapCanvas.tsx': { 'colour': 1 },
  'src/components/Interval/map/mapLayers.ts': { 'colour': 9 },
  'src/components/Interval/map/stopStyle.ts': { 'colour': 4 },
  'src/components/Interval/map/useContextLayer.ts': { 'colour': 1 },
  'src/components/Live/sections/BuildupSection.tsx': { 'min-sample': 1 },
  'src/components/Live/sections/BunchingSection.tsx': { 'min-sample': 1 },
  'src/components/Live/sections/LateByHourSection.tsx': { 'min-sample': 2 },
  'src/components/Live/sections/RunTimeSection.tsx': { 'min-sample': 1 },
  'src/components/MapApp/MapAppMap.tsx': { 'colour': 1 },
  'src/components/ModeTransition.tsx': { 'colour': 1 },
  'src/components/PageContents.tsx': { 'colour': 1 },
  'src/data/freeChildFares.ts': { 'scale-array': 2 },
  'src/hooks/useIntervalStats.ts': { 'definition': 1 },
  'src/utils/contextLayer.ts': { 'colour': 3 },
  'src/utils/mapExport.ts': { 'colour': 2 },
  'src/utils/mapExportDetails.ts': { 'colour': 1 },
  'vercel.json': { 'origin': 1 },
};
