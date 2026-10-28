import { delayAmount } from '../../utils/headwayText';
import { liveVehicleRowLabel } from '../../utils/format';
import { getVehicleStatus } from '../../utils/colors';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import type { RouteAnalysisPatterns } from '../../hooks/useRouteAnalysisPatterns';
import { destinationKind } from '../../utils/liveGrouping';

/** Schedule status for a vehicle, or '' when the feed gives none (never a "No data" placeholder). */
export function delayLabel(v: Pick<LiveVehicle, 'statusLabel' | 'delayMin'>): string {
  if (v.statusLabel) return v.statusLabel;
  const status = getVehicleStatus(v.delayMin);
  if (status === 'no_data') return '';
  if (status === 'early') return `${delayAmount(Math.round(Math.abs(v.delayMin!)))} early`;
  if (status === 'late') return `${delayAmount(Math.round(v.delayMin!))} late`;
  return 'On time';
}

export interface VehicleCardRow {
  label: string;
  value: string;
  /** Set on the schedule row so it takes the same on time / late colour as the list. */
  status?: LiveVehicle['status'];
  /** A small tag beside the value ("Short turn"). */
  tag?: string;
}

/**
 * What the vehicle card shows, from the Live feed's own fields only. A row appears only when the
 * feed gave its value. The feed has no next-stop field, so the card never shows one.
 */
export function vehicleCardRows(
  v: Pick<LiveVehicle, 'headsign' | 'directionId' | 'speedKmh' | 'delayMin' | 'statusLabel' | 'status'>,
  directionLabel: string | null | undefined,
  /** Whether this trip is a short turn or a branch (destinationKind); unknown: no tag. */
  tripEnd?: 'shortTurn' | 'branch',
): VehicleCardRow[] {
  const rows: VehicleCardRow[] = [];
  const direction = directionLabel?.trim();
  const destination = v.headsign?.trim();
  // Every car reads "Direction: to Distillery", the line's end for its direction; a short turn adds
  // "Ends at Broadview & Queen" with a "Short turn" tag. Never a compass word (CIV-1043, Ryan's approved wording).
  // A branch (504B to Broadview) runs to its own end, so it reads "Direction: to Broadview", untagged; the tag is
  // only for a trip whose last stop is on its direction's line, never a guess.
  const branch = tripEnd === 'branch' && !!destination;
  if (branch) rows.push({ label: 'Direction', value: `to ${destination}` });
  else if (direction) rows.push({ label: 'Direction', value: `to ${direction}` });
  if (!branch && destination && destination !== direction) rows.push({ label: 'Ends at', value: destination, ...(direction && tripEnd === 'shortTurn' ? { tag: 'Short turn' } : {}) });
  if (v.speedKmh != null) rows.push({ label: 'Speed', value: `${v.speedKmh} km/h` });
  const schedule = delayLabel(v);
  if (schedule) rows.push({ label: 'Schedule', value: schedule, status: v.status });
  return rows;
}

/**
 * The card's rows, less Direction and Ends at until the vehicles have been placed by their trips (ready), so a card
 * opened from a link never shows the nearest-shape guess first (CIV-1068).
 */
export function placedRows(rows: VehicleCardRow[], ready: boolean): VehicleCardRow[] {
  return ready ? rows : rows.filter(row => row.label !== 'Direction' && row.label !== 'Ends at');
}

/** "Bus 8123" (or "4412" on a streetcar route, CIV-926) when the feed names the vehicle; null when it would only be a generic "Vehicle N". */
export function vehicleCardName(
  v: Pick<LiveVehicle, 'id' | 'vehicleLabel'>,
  modeWord: string,
): string | null {
  const name = liveVehicleRowLabel({ headsign: null, id: v.id, vehicleLabel: v.vehicleLabel }, 0, modeWord);
  return name.startsWith('Vehicle ') ? null : name;
}

/**
 * Every vehicle row's label: the card's name ("Bus 8123", "4412"), or "Vehicle N" (its place in the
 * list) when the feed gives no usable number. Never the destination, so rows don't mix the two.
 */
export function vehicleRowName(v: Pick<LiveVehicle, 'id' | 'vehicleLabel'>, index: number, modeWord: string): string {
  return vehicleCardName(v, modeWord) ?? liveVehicleRowLabel({ headsign: null, id: v.id, vehicleLabel: v.vehicleLabel }, index, modeWord);
}

/**
 * Whether the card's trip is a short turn or a branch, for its "Ends at" row (CIV-1043): only once the route's
 * analysis has loaded and only for a destination short of the direction's end; otherwise no tag.
 */
export function cardTripEnd(
  headsign: string | null | undefined,
  directionLabel: string | null | undefined,
  analysis: Pick<RouteAnalysisPatterns, 'patterns' | 'stopNames'> | null,
): 'shortTurn' | 'branch' | undefined {
  if (!headsign || !analysis || headsign === directionLabel) return undefined;
  return destinationKind(analysis.patterns, headsign, analysis.stopNames) ?? undefined;
}
