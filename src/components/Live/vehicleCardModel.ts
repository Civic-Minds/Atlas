import { delayAmount } from '../../utils/headwayText';
import { liveVehicleRowLabel } from '../../utils/format';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

/** Schedule status for a vehicle, or '' when the feed gives none (never a "No data" placeholder). */
export function delayLabel(v: Pick<LiveVehicle, 'statusLabel' | 'delayMin'>): string {
  if (v.statusLabel) return v.statusLabel;
  if (v.delayMin === null) return '';
  if (v.delayMin <= -1.5) return `${delayAmount(Math.round(Math.abs(v.delayMin)))} early`;
  if (v.delayMin >= 5.5) return `${delayAmount(Math.round(v.delayMin))} late`;
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
