import { STATUS_COLORS } from '../utils/colors';
import type { HistoryMapStop } from '../context/HistoryMapOverlay';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';

export function formatGap(gap: number | null): string {
  if (gap === null) return '–';
  return `${Math.round(gap * 10) / 10}m`;
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return '–';
  const abs = Math.round(Math.abs(delta) * 10) / 10;
  if (Math.abs(delta) < 0.5) return 'on time';
  return delta > 0 ? `+${abs}m` : `–${abs}m`;
}

export function StopCardHtml(stop: HistoryMapStop, expanded: boolean): string {
  const color = STATUS_COLORS[
    stop.headwayDeltaMin === null ? 'no_data'
    : stop.headwayDeltaMin <= -1.5 ? 'early'
    : stop.headwayDeltaMin >= 5.5 ? 'late'
    : 'on_time'
  ].border;
  const delta = formatDelta(stop.headwayDeltaMin);
  const gap = formatGap(stop.avgGap);

  return `
    <div class="history-stop-card" data-stop-id="${stop.stopId}" style="
      background: var(--bg-panel, #fff);
      border: 1.5px solid ${color};
      border-radius: 12px;
      padding: 8px 12px;
      min-width: 120px;
      max-width: 180px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      cursor: pointer;
      pointer-events: auto;
      font-family: inherit;
    ">
      <p style="font-size:9px;font-weight:700;color:var(--text-dim,#6b7280);margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${stop.name}</p>
      <div style="display:flex;align-items:baseline;gap:3px;">
        <span style="font-size:18px;font-weight:900;color:var(--text-primary,#111);line-height:1;">${gap}</span>
        <span style="font-size:9px;color:var(--text-dim,#6b7280);">gap</span>
      </div>
      <span style="font-size:10px;font-weight:700;color:${color};">${delta}</span>
      ${expanded ? `
        <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border-primary,#e5e7eb);">
          <p style="font-size:9px;color:var(--text-dim,#6b7280);margin:0;">scheduled every ${stop.scheduledHeadwayMin ?? '?'}m</p>
        </div>
      ` : ''}
    </div>
  `;
}

export function VehicleMarkerHtml(vehicle: LiveVehicle): string {
  const colors = STATUS_COLORS[vehicle.status];
  return `
    <div class="live-vehicle-marker" style="
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: 11px;
      background: ${colors.bg};
      border: 1.5px solid ${colors.border};
      color: white;
      font-size: 9px;
      font-weight: 900;
      font-family: 'Inter', ui-sans-serif, sans-serif;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.22);
      cursor: pointer;
    ">
      ${vehicle.routeShortName}
      ${vehicle.bearing !== null ? `
        <div style="
          position: absolute;
          top: -5px;
          left: 50%;
          transform: translateX(-50%) rotate(${vehicle.bearing}deg);
          transform-origin: 50% 16px;
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 6px solid ${colors.border};
        "></div>
      ` : ''}
    </div>
  `;
}
