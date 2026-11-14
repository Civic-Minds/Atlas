import { STATUS_COLORS, getVehicleColors, type ColorVisionMode } from '../utils/colors';
import { cleanRouteShortName } from '../utils/format';
import { delayLabel } from '../components/Live/vehicleCardModel';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { escapeHtml } from './escapeHtml';

export function VehicleMarkerHtml(vehicle: LiveVehicle, hideText: boolean = false): string {
  const colors = STATUS_COLORS[vehicle.status];
  
  if (hideText) {
    return `
      <div class="live-vehicle-marker" style="
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: ${colors.bg};
        border: 1.5px solid ${colors.border};
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        cursor: pointer;
      ">
        ${vehicle.bearing !== null ? `
          <div style="
            position: absolute;
            top: -4px;
            left: 50%;
            transform: translateX(-50%) rotate(${vehicle.bearing}deg);
            transform-origin: 50% 8px;
            width: 0;
            height: 0;
            border-left: 2.5px solid transparent;
            border-right: 2.5px solid transparent;
            border-bottom: 4px solid ${colors.border};
          "></div>
        ` : ''}
      </div>
    `;
  }

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
      ${escapeHtml(vehicle.routeShortName)}
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

/** The Live map's hover tooltip for a vehicle dot. GTFS-RT text must be escaped before innerHTML. */
export function vehicleTooltipHtml(v: LiveVehicle, colorMode: ColorVisionMode = 'default'): string | null {
  if (!v.routeShortName) return null;
  // The same schedule text and colour as the Live cards (vehicleCardModel delayLabel, colors getVehicleColors).
  const label = delayLabel(v);
  const color = v.status === 'no_data' ? 'var(--text-muted)' : getVehicleColors(v.status, colorMode).border;
  const routeLabel = escapeHtml(cleanRouteShortName(v.routeShortName));
  const headsign = v.headsign ? escapeHtml(v.headsign) : '';
  const speed = v.speedKmh != null ? escapeHtml(String(v.speedKmh)) : null;
  return `
    <div style="font-family:'Inter',ui-sans-serif,sans-serif;padding:8px 10px;min-width:130px;line-height:1.4;">
      <div style="font-size:9px;font-weight:800;color:var(--text-dim);">Route ${routeLabel}</div>
      ${headsign ? `<div style="font-size:11px;font-weight:700;color:var(--text-primary);margin-top:2px;">${headsign}</div>` : ''}
      ${speed != null ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Speed</span><span style="font-size:10px;font-weight:800;color:var(--text-primary);">${speed} km/h</span></div>` : ''}
      ${label ? `<div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-primary);padding-top:5px;margin-top:6px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Status</span><span style="font-size:10px;font-weight:800;color:${color};">${escapeHtml(label)}</span></div>` : ''}
    </div>`;
}
