import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, ZoomControl, Popup } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, RotateCcw, Activity, Globe, Filter, Search, Info } from 'lucide-react';
import { GtfsData, AnalysisResult } from '../../utils/gtfsUtils';
import { storage, STORES } from '../../core/storage';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import 'leaflet/dist/leaflet.css';
import './Atlas.css';

const TIER_COLORS: Record<string, string> = {
    '10': '#10b981', // emerald-500 (Frequent+)
    '15': '#3b82f6', // blue-500 (Frequent)
    '20': '#6366f1', // indigo-500 (Good)
    '30': '#f59e0b', // amber-500 (Basic)
    '60': '#f97316', // orange-500 (Infrequent)
    'span': '#64748b' // slate-500 (Service Span only)
};

const TIER_LABELS: Record<string, string> = {
    '10': 'Rapid (10m)',
    '15': 'Frequent (15m)',
    '20': 'Good (20m)',
    '30': 'Standard (30m)',
    '60': 'Infrequent (60m)',
    'span': 'Daily Span'
};

export default function AtlasView() {
    const [gtfsData, setGtfsData] = useState<GtfsData | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDay, setActiveDay] = useState('Weekday');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set(['10', '15', '20'])); // Default to high-frequency
    const [mapStyle, setMapStyle] = useState<'dark' | 'light'>('dark');

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
                console.error('Failed to load Atlas data', e);
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
                    shape: shapePoints,
                    routeShortName: route?.route_short_name || route?.route_id,
                    routeLongName: route?.route_long_name
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
                <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Initializing Global Atlas Engine...</p>
            </div>
        );
    }

    if (!gtfsData || gtfsData.routes?.length === 0) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={Globe}
                    title="Atlas Empty"
                    description="No transit data available. Upload a GTFS feed in the Screen module or administrative console to see the system-wide Atlas."
                    primaryAction={{
                        label: "Go to Screen",
                        icon: Activity,
                        href: "/screener"
                    }}
                />
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-[#111]">
            <MapContainer
                center={[43.7, -79.4]} // Default to Toronto, would be nice to auto-zoom to bounds
                zoom={12}
                zoomControl={false}
                className="w-full h-full h-[calc(100vh-5rem)]"
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
                            weight: activeTiers.has(route.tier) ? 4 : 2,
                            opacity: activeTiers.size === 0 || activeTiers.has(route.tier) ? 0.9 : 0.1,
                            lineJoin: 'round'
                        }}
                    >
                        <Popup className="atlas-popup">
                            <div className="p-3 min-w-[180px]">
                                <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-[var(--border)]">
                                    <div className="flex flex-col">
                                        <span className="atlas-label leading-none mb-1">Route {route.routeShortName}</span>
                                        <span className="text-xs font-black text-[var(--fg)] truncate max-w-[100px]">{route.routeLongName}</span>
                                    </div>
                                    <span className="atlas-label px-1.5 py-0.5 rounded text-[9px] font-black" style={{ backgroundColor: `${route.color}22`, color: route.color, border: `1px solid ${route.color}44` }}>
                                        {Math.round(route.avgHeadway)}m
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="atlas-label text-[8px] mb-1">Reliability</div>
                                        <div className="text-[10px] font-black atlas-mono">{route.reliabilityScore}%</div>
                                    </div>
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="atlas-label text-[8px] mb-1">Trips</div>
                                        <div className="text-[10px] font-black atlas-mono">{route.tripCount}</div>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </Polyline>
                ))}
            </MapContainer>

            {/* Sidebar Controls */}
            <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-4 w-72 pointer-events-none">
                <div className="glass-panel p-6 pointer-events-auto border-l-4 border-emerald-500 shadow-2xl">
                    <header className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                                <Globe className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black tracking-tight leading-none text-[var(--fg)]">Map</h1>
                                <p className="text-[9px] atlas-label !text-emerald-600 mt-1 uppercase font-black tracking-wider">System Overview</p>
                            </div>
                        </div>
                        <button onClick={() => setActiveTiers(new Set(['10', '15', '20', '30', '60', 'span']))}>
                            <RotateCcw className="w-4 h-4 text-[var(--text-muted)] hover:text-emerald-500 transition-colors" />
                        </button>
                    </header>

                    {/* Day Toggle */}
                    <div className="grid grid-cols-3 gap-1 bg-[var(--item-bg)] p-1 rounded-xl mb-6 border border-[var(--border)]">
                        {['Weekday', 'Saturday', 'Sunday'].map(day => (
                            <button
                                key={day}
                                onClick={() => setActiveDay(day)}
                                className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${activeDay === day
                                    ? 'bg-[var(--bg)] text-emerald-600 shadow-sm border border-[var(--border)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>

                    {/* Frequency Filters */}
                    <div className="space-y-1">
                        <span className="atlas-label text-[8px] mb-3 block opacity-50">Filter by Headway (Minutes)</span>
                        {Object.entries(TIER_LABELS).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => toggleTier(id)}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${activeTiers.has(id)
                                    ? 'border-emerald-500/30 bg-emerald-500/10'
                                    : 'border-transparent hover:bg-[var(--item-bg)]/50 group'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]" style={{ backgroundColor: TIER_COLORS[id] }} />
                                    <span className={`text-[10px] font-bold transition-colors ${activeTiers.has(id) ? 'text-[var(--fg)]' : 'text-[var(--text-muted)] group-hover:text-[var(--fg)]'}`}>{label}</span>
                                </div>
                                {activeTiers.has(id) ? (
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                                        <div className="w-1 h-1 rounded-full bg-white" />
                                    </div>
                                ) : (
                                    <div className="w-3 h-3 rounded-full border border-[var(--border)]" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="glass-panel p-4 pointer-events-auto border border-white/5 shadow-xl flex items-center gap-4">
                    <div className="flex-1">
                        <div className="atlas-label text-[10px] text-emerald-500 flex items-center gap-2 mb-1">
                            <Info className="w-3 h-3" /> System Live
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] leading-snug font-medium">Visualizing {filteredMapData.length} unique frequent corridors across current viewport.</p>
                    </div>
                </div>
            </div>

            {/* Map Style Toggle */}
            <div className="absolute top-6 right-6 z-[1000] flex gap-1 bg-[var(--item-bg)]/50 backdrop-blur-md p-1 rounded-xl border border-[var(--border)]">
                <button
                    onClick={() => setMapStyle('dark')}
                    className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${mapStyle === 'dark' ? 'bg-indigo-600 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}
                >
                    Dark
                </button>
                <button
                    onClick={() => setMapStyle('light')}
                    className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${mapStyle === 'light' ? 'bg-indigo-600 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-white'}`}
                >
                    Light
                </button>
            </div>
        </div>
    );
}
