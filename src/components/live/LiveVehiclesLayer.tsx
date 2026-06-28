import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useLiveVehiclesMapOverlay } from '../../context/LiveVehiclesMapOverlay';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

function getVehicleColors(status: LiveVehicle['status']): { bg: string; border: string } {
  switch (status) {
    case 'early':
      return { bg: '#3182ce', border: '#2b6cb0' }; // Blue
    case 'late':
      return { bg: '#e53e3e', border: '#9b2c2c' }; // Red
    case 'on_time':
      return { bg: '#38a169', border: '#276749' }; // Green
    default:
      return { bg: '#718096', border: '#4a5568' }; // Gray
  }
}

function VehicleMarkerHtml(vehicle: LiveVehicle): string {
  const { bg, border } = getVehicleColors(vehicle.status);
  
  return `
    <div class="live-vehicle-marker" style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: ${bg};
      border: 2px solid ${border};
      color: white;
      font-size: 10px;
      font-weight: 900;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      position: relative;
    ">
      ${vehicle.routeShortName}
      ${vehicle.bearing !== null ? `
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          transform: rotate(${vehicle.bearing}deg);
          pointer-events: none;
        ">
          <div style="
            position: absolute;
            top: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 6px solid ${border};
          "></div>
        </div>
      ` : ''}
    </div>
  `;
}

function VehiclePopupHtml(vehicle: LiveVehicle): string {
  const { border } = getVehicleColors(vehicle.status);
  const formattedDelay = vehicle.delayMin === null
    ? 'No schedule data'
    : vehicle.delayMin <= -1.5
      ? `${Math.abs(vehicle.delayMin)} min early`
      : vehicle.delayMin >= 5.5
        ? `${vehicle.delayMin} min late`
        : 'On time';

  return `
    <div style="font-family: sans-serif; padding: 4px; min-width: 160px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span style="background: ${border}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase;">
          ${vehicle.routeShortName}
        </span>
        <span style="font-size: 11px; font-weight: 800; color: var(--text-primary, #111);">
          ${vehicle.displayName || 'Route'}
        </span>
      </div>
      <p style="font-size: 10px; margin: 4px 0 8px; color: #718096;">
        to <strong>${vehicle.headsign || 'unknown destination'}</strong>
      </p>
      <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 4px;">
        <span style="font-size: 9px; color: #a0aec0; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Adherence</span>
        <span style="font-size: 10px; font-weight: 800; color: ${border};">${formattedDelay}</span>
      </div>
    </div>
  `;
}

export function LiveVehiclesLayer() {
  const map = useMap();
  const { overlay } = useLiveVehiclesMapOverlay();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    // Clear old markers if overlay is removed
    if (!overlay) {
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      return;
    }

    const currentVehicles = new Map<string, LiveVehicle>();
    overlay.vehicles.forEach(v => currentVehicles.set(v.id, v));

    // Remove markers for vehicles no longer present
    markersRef.current.forEach((marker, id) => {
      if (!currentVehicles.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Update or add markers for current vehicles
    overlay.vehicles.forEach(vehicle => {
      const position: L.LatLngTuple = [vehicle.lat, vehicle.lon];
      const icon = L.divIcon({
        html: VehicleMarkerHtml(vehicle),
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const existingMarker = markersRef.current.get(vehicle.id);
      if (existingMarker) {
        // Move marker and update icon/popup
        existingMarker.setLatLng(position);
        existingMarker.setIcon(icon);
        existingMarker.setPopupContent(VehiclePopupHtml(vehicle));
      } else {
        // Create new marker
        const marker = L.marker(position, { icon, zIndexOffset: 2000 })
          .bindPopup(VehiclePopupHtml(vehicle), {
            className: 'live-vehicle-popup',
            closeButton: false,
          })
          .addTo(map);

        markersRef.current.set(vehicle.id, marker);
      }
    });

    // Fly/fit bounds if centering is needed on initial load
    if (overlay.vehicles.length > 0 && overlay.agencyCenter && markersRef.current.size === overlay.vehicles.length) {
      // Only fly to center if we just loaded or switched agency
      const mapCenter = map.getCenter();
      const dist = map.distance(mapCenter, L.latLng(overlay.agencyCenter));
      if (dist > 50000) { // more than 50km away
        map.flyTo(overlay.agencyCenter, 13, { duration: 1.0 });
      }
    } else if (overlay.vehicles.length === 0 && overlay.agencyCenter) {
      map.flyTo(overlay.agencyCenter, 13, { duration: 1.0 });
    }
  }, [map, overlay]);

  // Center map and open popup on focusedVehicle
  useEffect(() => {
    if (!overlay?.focusedVehicle) return;
    const { id, lat, lon } = overlay.focusedVehicle;
    const marker = markersRef.current.get(id);
    if (marker) {
      map.setView([lat, lon], 14);
      marker.openPopup();
    } else {
      map.setView([lat, lon], 14);
    }
  }, [map, overlay?.focusedVehicle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
    };
  }, []);

  return null;
}
