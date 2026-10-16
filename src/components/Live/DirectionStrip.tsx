import { useMemo } from 'react';
import type { DashboardBand, LiveV3, UncertainStart } from '../../../shared/liveDashboard';
import RouteStrip from './RouteStrip';
import BranchStrip from './BranchStrip';
import { routeStripFromV3, type RouteStripMode, type RouteStripStop } from './routeStripModel';
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
export default function DirectionStrip({ v3, directionId, band, uncertain, className, selectedId = null, onSelect, selectedStretch = null, onSelectStretch }: {
  v3: LiveV3;
  directionId: number;
  band: DashboardBand;
  uncertain: readonly UncertainStart[];
  className?: string;
  selectedId?: string | null;
  onSelect?: (stopId: string) => void;
  selectedStretch?: RouteStripMode | null;
  onSelectStretch?: (mode: RouteStripMode) => void;
}) {
  const branch = useMemo(() => branchStripFromV3(v3, directionId, band, uncertain), [v3, directionId, band, uncertain]);
  const straight = useMemo(() => routeStripFromV3(v3, directionId, band, uncertain), [v3, directionId, band, uncertain]);
  if (branch) return <BranchStrip className={className} model={branch} selected={selectedId} onSelect={onSelect} />;
  return (
    <RouteStrip
      className={className}
      stops={straight.stops} directionLabel={straight.label} delaysStart={straight.delaysStart} bunchingForms={straight.bunchingForms}
      selected={selectedId ? straight.stops.findIndex(s => s.stopId === selectedId) : null}
      onSelect={onSelect ? i => onSelect(straight.stops[i].stopId) : undefined}
      selectedStretch={selectedStretch}
      onSelectStretch={onSelectStretch}
    />
  );
}
