import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Stop } from '../data/routeData';
import { MAP_PRESETS, getTheme } from '../../../core/mapStyles';

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
    const [theme, setTheme] = useState(getTheme());

    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(getTheme()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const preset = MAP_PRESETS[theme as 'light' | 'dark'];

    return (
        <MapContainer
            center={shape[0] || [43.645, -79.400]}
            zoom={13}
            className={`simulator-map ${preset.styles.container}`}
            zoomControl={false}
        >
            <TileLayer
                key={theme}
                attribution={preset.attribution}
                url={preset.url}
            />

            <FitBounds shape={shape} />

            {/* Route line */}
            <Polyline
                positions={shape}
                pathOptions={preset.styles.polyline as L.PathOptions}
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
                                ? (theme === 'dark' ? '#ffffff' : '#4f46e5')
                                : isEnabled
                                    ? preset.styles.polyline.color
                                    : '#64748b',
                            fillColor: isTerminal
                                ? preset.styles.polyline.color
                                : isEnabled
                                    ? preset.styles.polyline.color
                                    : (theme === 'dark' ? '#020617' : '#f8fafc'),
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
