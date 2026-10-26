import { delayAmount } from '../../utils/headwayText';
import { liveVehicleRowLabel } from '../../utils/format';
import { getVehicleStatus } from '../../utils/colors';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

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
}

/**
 * What the vehicle card shows, from the Live feed's own fields only. A row appears only when the
 * feed gave its value. The feed has no next-stop field, so the card never shows one.
 */
export function vehicleCardRows(
  v: Pick<LiveVehicle, 'headsign' | 'directionId' | 'speedKmh' | 'delayMin' | 'statusLabel' | 'status'>,
  directionLabel: string | null | undefined,
): VehicleCardRow[] {
  const rows: VehicleCardRow[] = [];
  const direction = directionLabel?.trim();
  const destination = v.headsign?.trim();
  if (direction && direction !== destination) rows.push({ label: 'Direction', value: direction });
  if (destination) rows.push({ label: 'Destination', value: destination });
  if (v.speedKmh != null) rows.push({ label: 'Speed', value: `${v.speedKmh} km/h` });
  const schedule = delayLabel(v);
  if (schedule) rows.push({ label: 'Schedule', value: schedule, status: v.status });
  return rows;
}

/** "Streetcar 4412" when the feed names the vehicle; null when it would only be a generic "Vehicle N". */
export function vehicleCardName(
  v: Pick<LiveVehicle, 'id' | 'vehicleLabel'>,
  modeWord: string,
): string | null {
  const name = liveVehicleRowLabel({ headsign: null, id: v.id, vehicleLabel: v.vehicleLabel }, 0, modeWord);
  return name.startsWith('Vehicle ') ? null : name;
}

/**
 * Every vehicle row's label: the card's name ("Streetcar 4412"), or "Vehicle N" (its place in the
 * list) when the feed gives no usable number. Never the destination, so rows don't mix the two.
 */
export function vehicleRowName(v: Pick<LiveVehicle, 'id' | 'vehicleLabel'>, index: number, modeWord: string): string {
  return vehicleCardName(v, modeWord) ?? liveVehicleRowLabel({ headsign: null, id: v.id, vehicleLabel: v.vehicleLabel }, index, modeWord);
}
