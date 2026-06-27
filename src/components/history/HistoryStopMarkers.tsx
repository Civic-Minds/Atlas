import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useHistoryMapOverlay } from '../../context/HistoryMapOverlay';
import { getDelayColor } from '../../utils/colors';
import type { HistoryMapStop } from '../../context/HistoryMapOverlay';

function formatGap(gap: number | null): string {
  if (gap === null) return '–';
  return `${Math.round(gap * 10) / 10}m`;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '–';
  const abs = Math.round(Math.abs(delta) * 10) / 10;
  if (Math.abs(delta) < 0.5) return 'on time';
  return delta > 0 ? `+${abs}m` : `–${abs}m`;
}

function StopCardHtml(stop: HistoryMapStop, expanded: boolean): string {
  const color = getDelayColor(stop.headwayDeltaMin);
  const delta = formatDelta(stop.headwayDeltaMin);
  const gap = formatGap(stop.avgGap);

  const base = `
    <div class="history-stop-card" data-stop-id="${stop.stopId}" style="
      background: var(--bg-panel, #fff);
      border: 1.5px solid ${color};
      border-radius: 12px;
      padding: 8px 12px;
      min-width: 130px;
      max-width: 200px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      cursor: pointer;
      font-family: inherit;
      position: relative;
    ">
      <p style="font-size:10px;font-weight:700;color:var(--text-dim,#6b7280);margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${stop.name}</p>
      <div style="display:flex;align-items:baseline;gap:4px;">
        <span style="font-size:20px;font-weight:900;color:var(--text-primary,#111);line-height:1;">${gap}</span>
        <span style="font-size:10px;color:var(--text-dim,#6b7280);">gap</span>
      </div>
      <span style="font-size:11px;font-weight:700;color:${color};">${delta}</span>
      ${expanded ? `
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-primary,#e5e7eb);">
          <p style="font-size:10px;color:var(--text-dim,#6b7280);margin:0;">scheduled every ${stop.scheduledHeadwayMin ?? '?'}m</p>
        </div>
      ` : ''}
    </div>
  `;
  return base;
}

export function HistoryStopMarkers() {
  const map = useMap();
  const { overlay } = useHistoryMapOverlay();
  const markersRef = useRef<L.Marker[]>([]);
  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!overlay) return;

    if (overlay.stops.length === 0) {
      if (overlay.agencyCenter) {
        map.flyTo(overlay.agencyCenter, 13, { duration: 1.0 });
      }
      return;
    }

    const latlngs: L.LatLngTuple[] = [];

    overlay.stops.forEach(stop => {
      if (!stop.lat || !stop.lon) return;
      const isExpanded = expandedStop === stop.stopId;
      const html = StopCardHtml(stop, isExpanded);

      const icon = L.divIcon({
        html,
        className: '',
        iconAnchor: [65, 0],
      });

      const marker = L.marker([stop.lat, stop.lon], { icon, interactive: true, zIndexOffset: 1000 });

      marker.on('click', () => {
        setExpandedStop(prev => prev === stop.stopId ? null : stop.stopId);
      });

      marker.addTo(map);
      markersRef.current.push(marker);
      latlngs.push([stop.lat, stop.lon]);
    });

    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), {
        paddingTopLeft: [80, 80],
        paddingBottomRight: [80, 280],
        maxZoom: 14,
      });
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, overlay, expandedStop]);

  return null;
}
