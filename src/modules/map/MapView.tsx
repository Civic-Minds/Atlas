import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, ZoomControl, Popup } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Layers, Info, RotateCcw, Activity } from 'lucide-react';
import { GtfsData, AnalysisResult } from '../../utils/gtfsUtils';
import { storage, STORES } from '../../core/storage';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const TIER_COLORS: Record<string, string> = {
    '10': '#10b981', // emerald-500
    '15': '#3b82f6', // blue-500
    '20': '#6366f1', // indigo-500
    '30': '#f59e0b', // amber-500
    '60': '#f97316', // orange-500
    'span': '#64748b' // slate-500
};

const TIER_LABELS: Record<string, string> = {
    '10': 'Freq+',
    '15': 'Freq',
    '20': 'Good',
    '30': 'Basic',
    '60': 'Infreq',
    'span': 'Span Only'
};

export default function MapView() {
    const [gtfsData, setGtfsData] = useState<GtfsData | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDay, setActiveDay] = useState('Weekday');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
    const [mapStyle, setMapStyle] = useState<'standard' | 'dark' | 'light'>('dark');

    useEffect(() => {
        const loadPersisted = async () => {
            try {
                const savedGtfs = await storage.getItem<GtfsData>(STORES.GTFS, 'latest');
                const savedResults = await storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest');
                if (savedGtfs && savedResults) {
                    setGtfsData(savedGtfs);
                    setAnalysisResults(savedResults);
                }
            } catch (e) {
                console.error('Failed to load map data', e);
            } finally {
                setLoading(false);
            }
        };
        loadPersisted();
    }, []);

    const filteredMapData = useMemo(() => {
        if (!gtfsData || !analysisResults) return [];

        return analysisResults
            .filter(r => r.day === activeDay)
            .filter(r => activeTiers.size === 0 || activeTiers.has(r.tier))
            .map(r => {
                const route = gtfsData.routes?.find(rt => rt.route_id === r.route);
                const trips = gtfsData.trips?.filter(t => t.route_id === route?.route_id) || [];
                const firstTrip = trips[0];

                let shapePoints: [number, number][] = [];

                // Try explicit shape first
                const shape = gtfsData.shapes?.find(s => s.id === firstTrip?.shape_id);
                if (shape && shape.points.length > 0) {
                    shapePoints = shape.points;
                } else if (firstTrip) {
                    // Fallback to stop sequence
                    const stopTimes = gtfsData.stopTimes
                        ?.filter(st => st.trip_id === firstTrip.trip_id)
                        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence)) || [];

                    shapePoints = stopTimes.map(st => {
                        const stop = gtfsData.stops?.find(s => s.stop_id === st.stop_id);
                        return stop ? [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)] as [number, number] : null;
                    }).filter((p): p is [number, number] => p !== null);
                }

                return {
                    ...r,
                    color: TIER_COLORS[r.tier] || '#64748b',
                    shape: shapePoints
                };
            })
            .filter(r => r.shape && r.shape.length > 0);
    }, [gtfsData, analysisResults, activeDay, activeTiers]);

    const toggleTier = (tier: string) => {
        const next = new Set(activeTiers);
        if (next.has(tier)) next.delete(tier);
        else next.add(tier);
        setActiveTiers(next);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-[10px] text-[var(--text-muted)] font-bold">Waking Atlas core...</p>
            </div>
        );
    }

    if (!gtfsData || gtfsData.routes?.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center border border-indigo-500/20">
                    <Layers className="w-10 h-10 text-indigo-400" />
                </div>
                <div className="space-y-2">
                    <h2 className="atlas-h2">No Agency Data</h2>
                    <p className="text-[var(--text-muted)] max-w-xs mx-auto">Upload a GTFS zip in the Screener module or load sample data to see the city-wide frequency map.</p>
                </div>
                <button
                    onClick={() => window.location.href = '/screener'}
                    className="btn-primary py-3 px-8 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/20"
                >
                    Initialize Screener
                </button>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-[#111]">
            <MapContainer
                center={[43.7, -79.4]} // Default to Toronto
                zoom={11}
                zoomControl={false}
                className="w-full h-full h-[calc(100vh-4rem)]" // Height adjustment for TopNav
            >
                <TileLayer
                    url={mapStyle === 'dark'
                        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    }
                    attribution='&copy; OpenStreetMap &copy; CARTO'
                />
                <ZoomControl position="bottomright" />

                {filteredMapData.map((route, i) => (
                    <Polyline
                        key={`${route.route}-${i}`}
                        positions={route.shape}
                        pathOptions={{
                            color: route.color,
                            weight: activeTiers.has(route.tier) ? 5 : 3,
                            opacity: activeTiers.size === 0 || activeTiers.has(route.tier) ? 0.8 : 0.2,
                            lineJoin: 'round'
                        }}
                    >
                        <Popup className="atlas-popup">
                            <div className="p-3 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex flex-col">
                                        <span className="atlas-label leading-none mb-1">Route ID</span>
                                        <span className="text-sm font-black text-[var(--fg)] atlas-mono leading-none">{route.route}</span>
                                    </div>
                                    <span className="atlas-label px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${route.color}11`, color: route.color, border: `1px solid ${route.color}33` }}>
                                        {TIER_LABELS[route.tier]}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)]">
                                    <div className="precision-panel p-2 bg-[var(--item-bg)]">
                                        <div className="atlas-label mb-1">Headway</div>
                                        <div className="text-xs font-bold atlas-mono text-indigo-600 dark:text-indigo-400">{Math.round(route.avgHeadway)}m</div>
                                    </div>
                                    <div className="precision-panel p-2 bg-[var(--item-bg)]">
                                        <div className="atlas-label mb-1">Trips</div>
                                        <div className="text-xs font-bold atlas-mono text-indigo-600 dark:text-indigo-400">{route.tripCount}</div>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </Polyline>
                ))}
            </MapContainer>

            {/* HUD: Layers & Day Toggle */}
            <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-4 max-w-xs w-full pointer-events-none">
                <div className="precision-panel p-5 bg-[var(--card)]/80 backdrop-blur-xl pointer-events-auto border-l-4 border-indigo-500 shadow-2xl">
                    <div className="flex items-center justify-between mb-5 border-b border-[var(--border)] pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                <Layers className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div className="flex flex-col">
                                <h3 className="atlas-label normal-case tracking-normal">Frequency Atlas</h3>
                                <p className="text-[9px] text-[var(--text-muted)] font-bold mt-1">Toronto system</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveTiers(new Set())}
                            className="p-2 rounded-lg hover:bg-neutral-500/10 transition-colors text-[var(--text-muted)]"
                            title="Reset filters"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1 bg-[var(--item-bg)] p-1 rounded-xl mb-6 border border-[var(--border)]">
                        {['Weekday', 'Saturday', 'Sunday'].map(day => (
                            <button
                                key={day}
                                onClick={() => setActiveDay(day)}
                                className={`py-2 rounded-lg text-[10px] font-bold transition-all ${activeDay === day
                                    ? 'bg-[var(--bg)] text-indigo-600 dark:text-indigo-400 shadow-sm border border-[var(--border)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-1">
                        {Object.entries(TIER_LABELS).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => toggleTier(id)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all ${activeTiers.has(id)
                                    ? 'border-indigo-500/30 bg-indigo-500/5'
                                    : 'border-transparent hover:bg-[var(--item-bg)] group'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: TIER_COLORS[id] }} />
                                    <span className={`text-[11px] font-bold transition-colors ${activeTiers.has(id) ? 'text-[var(--fg)]' : 'text-[var(--text-muted)] group-hover:text-[var(--fg)]'}`}>{label}</span>
                                </div>
                                <span className={`atlas-mono text-[9px] font-black tracking-tighter px-1.5 py-0.5 rounded border ${activeTiers.has(id) ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' : 'bg-neutral-500/5 text-neutral-500/60 border-transparent'}`}>
                                    {id === 'span' ? 'Daily' : `${id}m`}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="precision-panel p-4 bg-[var(--card)]/80 backdrop-blur-xl pointer-events-auto border border-emerald-500/20 shadow-xl">
                    <div className="flex items-center gap-3">
                        <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="flex-1">
                            <p className="atlas-label normal-case text-emerald-600 dark:text-emerald-400 mb-0.5">Live data synced</p>
                            <p className="text-[10px] text-[var(--text-muted)] leading-tight font-medium">
                                Visualizing {filteredMapData.length} active corridors.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* View Mode Toggle */}
            <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-3">
                <div className="bg-[var(--card)]/80 backdrop-blur-xl p-1 rounded-xl border border-[var(--border)] flex gap-1 shadow-2xl">
                    <button
                        onClick={() => setMapStyle('dark')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${mapStyle === 'dark' ? 'bg-indigo-600 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                    >
                        Dark
                    </button>
                    <button
                        onClick={() => setMapStyle('light')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${mapStyle === 'light' ? 'bg-indigo-600 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                    >
                        Light
                    </button>
                </div>
            </div>
        </div>
    );
}
