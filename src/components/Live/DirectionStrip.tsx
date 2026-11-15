import { useMemo } from 'react';
import type { DashboardBand, LiveV3, UncertainStart } from '../../../shared/liveDashboard';
import RouteStrip, { StripLegend } from './RouteStrip';
import BranchStrip from './BranchStrip';
import { MIN_N, routeStripFromV3, stripLegendFlags, type RouteStripMode, type RouteStripStop } from './routeStripModel';
import { allBranchStops, branchStripFromV3 } from './branchStripModel';

/** Every stop drawn for a direction (the main pattern's, and any branch's), by stop id. */
export function directionStopsById(v3: LiveV3, directionId: number, band: DashboardBand, uncertain: readonly UncertainStart[]): Map<string, RouteStripStop> {
  const branch = branchStripFromV3(v3, directionId, band, uncertain);
  const stops = branch ? allBranchStops(branch) : routeStripFromV3(v3, directionId, band, uncertain).stops;
  return new Map(stops.map(s => [s.stopId, s]));
}

/**
 * One direction's strip: the branch-aware strip when the route runs more than one regular pattern (a trunk that forks),
 * the straight strip otherwise. Stops are picked by stop id either way.
 */
export default function DirectionStrip({ v3, directionId, band, uncertain, className, modes, legend = true, reserveBracket, twoLineNames, selectedId = null, onSelect, selectedStretch = null, onSelectStretch }: {
  v3: LiveV3;
  directionId: number;
  band: DashboardBand;
  uncertain: readonly UncertainStart[];
  className?: string;
  /** The tracks to draw (default: delay, then bunching). */
  modes?: readonly RouteStripMode[];
  /** Draw the key under the strip (default). A section showing several directions passes false and draws one StripsLegend (CIV-1448). */
  legend?: boolean;
  /** Side by side with another direction: keep the bracket room and the two-line row height the other has (BranchStrip only). */
  reserveBracket?: boolean;
  twoLineNames?: boolean;
  selectedId?: string | null;
  onSelect?: (stopId: string) => void;
  selectedStretch?: RouteStripMode | null;
  onSelectStretch?: (mode: RouteStripMode) => void;
}) {
  const branch = useMemo(() => branchStripFromV3(v3, directionId, band, uncertain), [v3, directionId, band, uncertain]);
  const straight = useMemo(() => routeStripFromV3(v3, directionId, band, uncertain), [v3, directionId, band, uncertain]);
  if (branch) return <BranchStrip className={className} modes={modes} legend={legend} reserveBracket={reserveBracket} twoLineNames={twoLineNames} model={branch} selected={selectedId} onSelect={onSelect} />;
  return (
    <RouteStrip
      className={className} modes={modes} legend={legend}
      stops={straight.stops} directionLabel={straight.label} delaysStart={straight.delaysStart} bunchingForms={straight.bunchingForms}
      selected={selectedId ? straight.stops.findIndex(s => s.stopId === selectedId) : null}
      onSelect={onSelect ? i => onSelect(straight.stops[i].stopId) : undefined}
      selectedStretch={selectedStretch}
      onSelectStretch={onSelectStretch}
    />
  );
}

/**
 * One key for a section of direction strips, as the map's route card shows its key once (CIV-1448): the same key each
 * strip would draw, listing a less exact, faded, not measured or early stop if any direction has one.
 */
export function StripsLegend({ v3, directionIds, band, uncertain, modes = ['delay', 'bunching'] }: {
  v3: LiveV3; directionIds: readonly number[]; band: DashboardBand; uncertain: readonly UncertainStart[]; modes?: readonly RouteStripMode[];
}) {
  const flags = useMemo(() => stripLegendFlags(directionIds.flatMap(d => [...directionStopsById(v3, d, band, uncertain).values()]), modes, MIN_N), [v3, directionIds, band, uncertain, modes]);
  if (!directionIds.length) return null;
  return <StripLegend modes={modes} {...flags} minN={MIN_N} />;
}
