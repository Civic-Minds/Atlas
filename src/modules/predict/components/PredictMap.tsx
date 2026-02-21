import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { usePredict } from '../PredictContext';
import 'leaflet/dist/leaflet.css';

// Helper to update map view when data loads
function MapUpdater({ center }: { center: [number, number] }) {
    const map = useMap();
    React.useEffect(() => {
        if (center) map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
}

interface PredictMapProps {
    viewMode: 'demand' | 'supply' | 'opportunity';
}

const PredictMap: React.FC<PredictMapProps> = ({ viewMode }) => {
    const { demandPoints, opportunityPoints, gtfsData } = usePredict();

    const center = useMemo<[number, number]>(() => {
        if (gtfsData && gtfsData.stops.length > 0) {
            const lats = gtfsData.stops.map(s => parseFloat(s.stop_lat));
            const lons = gtfsData.stops.map(s => parseFloat(s.stop_lon));
            return [
                (Math.min(...lats) + Math.max(...lats)) / 2,
                (Math.min(...lons) + Math.max(...lons)) / 2
            ];
        }
        return [43.6532, -79.3832]; // Default Toronto
    }, [gtfsData]);

    const displayPoints = viewMode === 'opportunity' ? opportunityPoints : demandPoints;

    return (
        <MapContainer
            center={center}
            zoom={13}
            zoomControl={false}
            className="w-full h-full bg-[#0f172a]"
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap &copy; CARTO'
            />
            <MapUpdater center={center} />

            {displayPoints.map((p, i) => {
                const isDemand = viewMode === 'demand';
                const isSupply = viewMode === 'supply';
                const isOpportunity = viewMode === 'opportunity';
                const opp = p as any;

                let color = '';
                let val = 0;

                if (isDemand) {
                    color = `rgba(79, 70, 229, ${0.1 + p.demand * 0.9})`; // Indigo
                    val = p.demand;
                } else if (isSupply) {
                    color = `rgba(16, 185, 129, ${0.1 + opp.supply * 0.9})`; // Emerald
                    val = opp.supply;
                } else {
                    color = `rgba(37, 99, 235, ${0.1 + opp.opportunityScore / 100})`; // Blue
                    val = opp.opportunityScore / 100;
                }

                const radius = 4 + (val * 12);

                return (
                    <CircleMarker
                        key={i}
                        center={[p.lat, p.lon]}
                        radius={radius}
                        pathOptions={{
                            fillColor: color,
                            fillOpacity: 0.6,
                            stroke: false
                        }}
                    >
                        <Popup className="atlas-popup">
                            <div className="p-3 space-y-2">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="atlas-label !text-blue-400">
                                        {isDemand ? 'Demand Node' : 'Service Gap'}
                                    </span>
                                    <span className="atlas-mono text-[10px] font-black">
                                        {isDemand
                                            ? Math.round(p.demand * 100)
                                            : opp.opportunityScore}%
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
                                    <div>
                                        <div className="atlas-label !text-[8px]">Population</div>
                                        <div className="text-[10px] font-bold atlas-mono">{p.population || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div className="atlas-label !text-[8px]">Supply Coverage</div>
                                        <div className="text-[10px] font-bold atlas-mono">
                                            {isDemand ? 'N/A' : `${Math.round(opp.supply * 100)}%`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
};

export default PredictMap;
