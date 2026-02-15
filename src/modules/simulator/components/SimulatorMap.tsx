import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Stop } from '../data/routeData';

interface SimulatorMapProps {
    stops: Stop[];
    shape: [number, number][];
    enabledStopIds: Set<string>;
    onToggleStop: (stopId: string) => void;
}

// Component to fit map bounds to the route
function FitBounds({ shape }: { shape: [number, number][] }) {
    const map = useMap();
    const fitted = useRef(false);

    useEffect(() => {
        if (!fitted.current && shape.length > 0) {
            const bounds = shape.reduce(
                (acc, [lat, lng]) => ({
                    minLat: Math.min(acc.minLat, lat),
                    maxLat: Math.max(acc.maxLat, lat),
                    minLng: Math.min(acc.minLng, lng),
                    maxLng: Math.max(acc.maxLng, lng),
                }),
                { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
            );
            map.fitBounds([
                [bounds.minLat - 0.005, bounds.minLng - 0.01],
                [bounds.maxLat + 0.005, bounds.maxLng + 0.01],
            ]);
            fitted.current = true;
        }
    }, [map, shape]);

    return null;
}

export default function SimulatorMap({ stops, shape, enabledStopIds, onToggleStop }: SimulatorMapProps) {
    return (
        <MapContainer
            center={shape[0] || [43.645, -79.400]}
            zoom={13}
            className="simulator-map"
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            <FitBounds shape={shape} />

            {/* Route line */}
            <Polyline
                positions={shape}
                pathOptions={{
                    color: '#818cf8', // indigo-400
                    weight: 4,
                    opacity: 0.7,
                }}
            />

            {/* Stop markers */}
            {stops.map((stop) => {
                const isEnabled = enabledStopIds.has(stop.id);
                const isTerminal = stop.isTerminal;

                return (
                    <CircleMarker
                        key={stop.id}
                        center={[stop.lat, stop.lng]}
                        radius={isTerminal ? 8 : 6}
                        pathOptions={{
                            color: isTerminal
                                ? '#ffffff'
                                : isEnabled
                                    ? '#818cf8'
                                    : '#64748b',
                            fillColor: isTerminal
                                ? '#818cf8'
                                : isEnabled
                                    ? '#818cf8'
                                    : '#1e293b',
                            fillOpacity: isEnabled ? 0.9 : 0.4,
                            weight: isTerminal ? 3 : 2,
                        }}
                        eventHandlers={{
                            click: () => {
                                if (!isTerminal) {
                                    onToggleStop(stop.id);
                                }
                            },
                        }}
                    >
                        <Tooltip
                            direction="top"
                            offset={[0, -10]}
                            className="stop-tooltip"
                        >
                            <div className="stop-tooltip-content">
                                <span className="stop-tooltip-name">{stop.name}</span>
                                {isTerminal && <span className="stop-tooltip-badge">Terminal</span>}
                                {!isTerminal && (
                                    <span className={`stop-tooltip-status ${isEnabled ? 'active' : 'removed'}`}>
                                        {isEnabled ? '● Active — click to remove' : '○ Removed — click to restore'}
                                    </span>
                                )}
                            </div>
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
