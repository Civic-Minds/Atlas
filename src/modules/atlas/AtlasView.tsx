import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, ZoomControl, Popup, useMap, CircleMarker } from 'react-leaflet';
import { RotateCcw, Activity, Globe, Info, Layers, Filter, Navigation, Clock, Users, Shield, Eye } from 'lucide-react';
import { useCatalogStore } from '../../types/catalogStore';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import { ModuleLanding } from '../../components/ModuleLanding';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';
import { usePopulationStore } from '../../hooks/usePopulationStore';
import type { LatLngBoundsExpression } from 'leaflet';
import { RouteDetailModal } from '../screener/components/RouteDetailModal';
import { AnalysisResult } from '../../types/gtfs';
import 'leaflet/dist/leaflet.css';
import './Atlas.css';

const TIER_COLORS: Record<string, string> = {
    '5': '#06b6d4',  // cyan-500
    '8': '#14b8a6',  // teal-500
    '10': '#10b981', // emerald-500
    '15': '#3b82f6', // blue-500
    '20': '#6366f1', // indigo-500
    '30': '#f59e0b', // amber-500
    '60': '#f97316', // orange-500
    'span': '#64748b' // slate-500
};

const TIER_LABELS: Record<string, string> = {
    '5': 'Rapid (5m)',
    '8': 'Freq++ (8m)',
    '10': 'Freq+ (10m)',
    '15': 'Frequent (15m)',
    '20': 'Good (20m)',
    '30': 'Standard (30m)',
    '60': 'Infrequent (60m)',
    'span': 'Daily Span'
};

/** Auto-fit map to data bounds */
const FitBounds: React.FC<{ bounds: LatLngBoundsExpression | null }> = ({ bounds }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
    }, [map, bounds]);
    return null;
};

export default function AtlasView() {
    const { isAuthenticated, agencyId, globalMode, toggleGlobalMode, role } = useAuthStore();
    const { currentRoutes, catalogRoutes, loading, loadCatalog, filterDate, setFilterDate, activeAgency, setActiveAgency } = useCatalogStore();
    const { points, coverage, loadPopulation, computeCoverage } = usePopulationStore();

    const [activeDay, setActiveDay] = useState('Weekday');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set(['5', '8', '10', '15', '20']));
    const [mapStyle, setMapStyle] = useState<'dark' | 'light'>('dark');
    const [realtimeEnabled, setRealtimeEnabled] = useState(false);
    const [popEnabled, setPopEnabled] = useState(false);
    const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);

    // Get unique commit dates for the timeline
    useEffect(() => {
        loadCatalog();
        loadPopulation();
    }, [loadCatalog, loadPopulation]);

    const timelineDates = useMemo(() => {
        const dates = new Set<number>();
        for (const r of catalogRoutes) {
            const d = new Date(r.committedAt);
            d.setMinutes(0, 0, 0);
            dates.add(d.getTime());
        }
        return Array.from(dates).sort((a, b) => a - b);
    }, [catalogRoutes]);

    const displayDate = filterDate || (timelineDates.length > 0 ? timelineDates[timelineDates.length - 1] : Date.now());

    // Initial tenant check — default to assigned agency if present
    useEffect(() => {
        if (agencyId) {
            setActiveAgency(agencyId);
        }
    }, [agencyId]);

    const { vehicles, loading: realtimeLoading, lastUpdate } = useVehicleTracking(activeAgency, realtimeEnabled);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    // Unique agencies in catalog
    const agencies = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of currentRoutes) {
            if (!map.has(r.agencyId)) map.set(r.agencyId, r.agencyName);
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [currentRoutes]);

    // Derived visibility based on tenancy and global toggle
    const visibleRoutes = useMemo(() => {
        // If not global mode and have an agencyId, strictly filter to that agency
        if (!globalMode && agencyId) {
            return currentRoutes.filter(r => r.agencyId === agencyId);
        }
        // If an agency is explicitly selected by researcher, filter to that
        if (activeAgency) {
            return currentRoutes.filter(r => r.agencyId === activeAgency);
        }
        return currentRoutes;
    }, [currentRoutes, globalMode, agencyId, activeAgency]);

    const filteredMapData = useMemo(() => {
        return visibleRoutes
            .filter(r => r.dayType === activeDay)
            .filter(r => activeTiers.size === 0 || activeTiers.has(r.tier))
            .filter(r => r.shape && r.shape.length > 0)
            .map(r => ({
                ...r,
                color: TIER_COLORS[r.tier] || '#64748b',
            }));
    }, [visibleRoutes, activeDay, activeTiers]);

    // Re-calculate coverage whenever filtered map data changes
    useEffect(() => {
        if (popEnabled && filteredMapData.length > 0) {
            computeCoverage(filteredMapData);
        }
    }, [filteredMapData, popEnabled, computeCoverage]);

    // Compute bounds from ALL routes for the current day
    const bounds = useMemo((): LatLngBoundsExpression | null => {
        const dayRoutes = currentRoutes.filter(r => r.dayType === activeDay && r.shape && r.shape.length > 0);
        if (dayRoutes.length === 0) return null;
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        for (const r of dayRoutes) {
            for (const [lat, lng] of r.shape) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }
        }
        if (minLat === 90) return null;
        return [[minLat, minLng], [maxLat, maxLng]];
    }, [currentRoutes, activeDay]);

    // Tier counts for current filters
    const tierCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        currentRoutes
            .filter(r => r.dayType === activeDay)
            .filter(r => !activeAgency || r.agencyId === activeAgency)
            .forEach(r => { counts[r.tier] = (counts[r.tier] || 0) + 1; });
        return counts;
    }, [currentRoutes, activeDay, activeAgency]);

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
                <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Loading catalog...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <ModuleLanding
                title="Atlas"
                description="See your entire transit network on a map, with routes colored by service frequency."
                icon={Globe}
                features={[]}
            />
        );
    }

    if (currentRoutes.length === 0 && !filterDate) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={Globe}
                    title="Atlas"
                    description="No routes in the catalog yet."
                    primaryAction={{
                        label: "Go to Analyze",
                        icon: Activity,
                        href: "/analyze"
                    }}
                />
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-[var(--bg)]">
            <MapContainer
                center={[34.05, -118.25]}
                zoom={10}
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
                <FitBounds bounds={bounds} />

                {filteredMapData.map((route, i) => (
                    <Polyline
                        key={`${route.id}-${i}`}
                        positions={route.shape}
                        pathOptions={{
                            color: route.color,
                            weight: 4,
                            opacity: 0.85,
                            lineJoin: 'round'
                        }}
                    >
                        <Popup className="atlas-popup">
                            <div className="p-3 min-w-[200px]">
                                <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-[var(--border)]">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{route.agencyName}</span>
                                        <span className="text-xs font-black text-[var(--fg)]">Route {route.route}</span>
                                        {route.routeLongName && (
                                            <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[130px]">{route.routeLongName}</span>
                                        )}
                                    </div>
                                    <span className="atlas-label px-1.5 py-0.5 rounded text-[9px] font-black" style={{ backgroundColor: `${route.color}22`, color: route.color, border: `1px solid ${route.color}44` }}>
                                        {Math.round(route.avgHeadway)}m
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="atlas-label text-[7px] mb-0.5">Reliability</div>
                                        <div className="text-[10px] font-black atlas-mono">{route.reliabilityScore}%</div>
                                    </div>
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="atlas-label text-[7px] mb-0.5">Trips</div>
                                        <div className="text-[10px] font-black atlas-mono">{route.tripCount}</div>
                                    </div>
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="atlas-label text-[7px] mb-0.5">Status</div>
                                        <div className={`text-[10px] font-black ${route.verificationStatus === 'verified' ? 'text-emerald-500' : route.verificationStatus === 'flagged' ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                                            {route.verificationStatus === 'verified' ? 'Verified' : route.verificationStatus === 'flagged' ? 'Flagged' : 'Pending'}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] text-[var(--text-muted)] atlas-mono">
                                    Snapshot: {new Date(route.committedAt).toLocaleString()}
                                </div>
                                <button 
                                    onClick={() => setSelectedResult({
                                        route: route.route,
                                        dir: route.dir,
                                        day: route.dayType as any,
                                        tier: route.tier,
                                        avgHeadway: route.avgHeadway,
                                        medianHeadway: route.medianHeadway,
                                        tripCount: route.tripCount,
                                        reliabilityScore: route.reliabilityScore,
                                        consistencyScore: route.consistencyScore || route.reliabilityScore,
                                        bunchingPenalty: route.bunchingPenalty || 0,
                                        outlierPenalty: route.outlierPenalty || 0,
                                        headwayVariance: route.headwayVariance || 0,
                                        bunchingFactor: route.bunchingFactor || 0,
                                        peakHeadway: route.peakHeadway || 0,
                                        baseHeadway: route.baseHeadway || 0,
                                        serviceSpan: route.serviceSpan,
                                        modeName: route.modeName,
                                        routeLongName: route.routeLongName,
                                        times: [],
                                        gaps: [],
                                        serviceIds: [],
                                        warnings: []
                                    })}
                                    className="w-full mt-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Activity className="w-3 h-3" /> View Route Audit
                                </button>
                            </div>
                        </Popup>
                    </Polyline>
                ))}

                {/* Real-time Vehicle Markers */}
                {realtimeEnabled && vehicles.map((v, i) => (
                    <CircleMarker
                        key={`${v.vehicle_id}-${i}`}
                        center={[v.lat, v.lon]}
                        radius={4}
                        pathOptions={{
                            fillColor: '#ffffff',
                            fillOpacity: 1,
                            color: '#000000',
                            weight: 1,
                        }}
                    >
                        <Popup className="atlas-popup">
                            <div className="p-3">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border)]">
                                    <Navigation className="w-4 h-4 text-emerald-500" style={{ transform: `rotate(${v.bearing}deg)` }} />
                                    <div>
                                        <span className="text-[10px] font-black text-[var(--fg)]">Vehicle {v.vehicle_id}</span>
                                        <p className="text-[8px] text-[var(--text-muted)] font-black tracking-widest leading-none uppercase">Route {v.route_id}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="text-[7px] atlas-label mb-0.5">Speed</div>
                                        <div className="text-[10px] font-black atlas-mono">{Math.round(v.speed)} kmh</div>
                                    </div>
                                    <div className="bg-[var(--item-bg)] p-2 rounded-lg border border-[var(--border)]">
                                        <div className="text-[7px] atlas-label mb-0.5">Seen</div>
                                        <div className="text-[10px] font-black atlas-mono">{new Date(v.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
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
                                <p className="text-xs font-semibold text-[var(--fg)]">
                                    {agencies.length} {agencies.length === 1 ? 'agency' : 'agencies'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {(role === 'admin' || role === 'researcher') && (
                                <button
                                    onClick={toggleGlobalMode}
                                    title={globalMode ? 'Switch to Tenant View' : 'Switch to Global View'}
                                    className={`p-2 rounded-lg transition-colors ${globalMode ? 'bg-indigo-500/10 text-indigo-500' : 'text-[var(--text-muted)] hover:bg-[var(--item-bg)]'}`}
                                >
                                    {globalMode ? <Shield className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            )}
                            <button onClick={() => {
                                setActiveTiers(new Set(Object.keys(TIER_LABELS)));
                                setFilterDate(null);
                                if (typeof setActiveAgency === 'function') setActiveAgency(null);
                            }}>
                                <RotateCcw className="w-4 h-4 text-[var(--text-muted)] hover:text-emerald-500 transition-colors" />
                            </button>
                        </div>
                    </header>

                    {/* Timeline Slider */}
                    {timelineDates.length > 1 && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="atlas-label text-[8px] opacity-50 uppercase tracking-widest">Network Timeline</span>
                                <span className="text-[9px] font-black text-emerald-500 atlas-mono">
                                    {new Date(displayDate).toLocaleDateString()}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={timelineDates[0]}
                                max={timelineDates[timelineDates.length - 1]}
                                step={3600000}
                                value={displayDate}
                                onChange={(e) => setFilterDate(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-[var(--item-bg)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between mt-1">
                                <span className="text-[7px] text-[var(--text-muted)] font-bold">{new Date(timelineDates[0]).toLocaleDateString()}</span>
                                <span className="text-[7px] text-[var(--text-muted)] font-bold">Latest</span>
                            </div>
                        </div>
                    )}

                    {/* Agency Filter — restricted if tenant-mapped and not in global mode */}
                    {(globalMode || !agencyId) && agencies.length > 1 && (
                        <div className="mb-6">
                            <span className="atlas-label text-[8px] mb-2 block opacity-50 uppercase tracking-widest">Agency Context</span>
                            <div className="space-y-1">
                                <button
                                    onClick={() => setActiveAgency(null)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${!activeAgency ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/30' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                                >
                                    Regional View
                                </button>
                                {agencies.map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => setActiveAgency(a.id === activeAgency ? null : a.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${activeAgency === a.id ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/30' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                                    >
                                        {a.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {!globalMode && agencyId && (
                        <div className="mb-6 px-3 py-2 bg-indigo-500/5 border border-indigo-500/10 rounded-lg">
                            <span className="atlas-label text-[8px] mb-1 block opacity-50 uppercase tracking-widest flex items-center gap-1">
                                <Shield className="w-2.5 h-3" /> Active Tenant
                            </span>
                            <div className="text-[10px] font-bold text-indigo-600 truncate">
                                {agencies.find(a => a.id === agencyId)?.name || agencyId}
                            </div>
                        </div>
                    )}

                    {/* Population Overlay Toggle */}
                    {points.length > 0 && (
                        <div className="mb-6">
                            <span className="atlas-label text-[8px] mb-2 block opacity-50 uppercase tracking-widest">Equity Layer</span>
                            <button
                                onClick={() => setPopEnabled(!popEnabled)}
                                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${popEnabled ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-[var(--border)] bg-[var(--item-bg)]/50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${popEnabled ? 'bg-indigo-500 text-white' : 'bg-[var(--item-bg)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                        <Users className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-[10px] font-black leading-none mb-1 ${popEnabled ? 'text-indigo-500' : 'text-[var(--fg)]'}`}>Pop. Coverage</p>
                                        <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">
                                            {popEnabled && coverage ? `${coverage.percentCovered.toFixed(1)}% Access` : 'Disabled'}
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${popEnabled ? 'bg-indigo-500' : 'bg-white/10'}`}>
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${popEnabled ? 'left-6' : 'left-1'}`} />
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Real-time Toggle */}
                    <div className="mb-6">
                        <span className="atlas-label text-[8px] mb-2 block opacity-50">Intelligence Layer</span>
                        <button
                            onClick={() => setRealtimeEnabled(!realtimeEnabled)}
                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${realtimeEnabled ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-[var(--border)] bg-[var(--item-bg)]/50'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${realtimeEnabled ? 'bg-emerald-500 text-white' : 'bg-[var(--item-bg)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                    <Navigation className={`w-4 h-4 ${realtimeEnabled ? 'animate-pulse' : ''}`} />
                                </div>
                                <div className="text-left">
                                    <p className={`text-[10px] font-black leading-none mb-1 ${realtimeEnabled ? 'text-emerald-500' : 'text-[var(--fg)]'}`}>Live Positions</p>
                                    <p className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-widest">{realtimeLoading ? 'Polling...' : realtimeEnabled ? `${vehicles.length} Detected` : 'Disabled'}</p>
                                </div>
                            </div>
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${realtimeEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${realtimeEnabled ? 'left-6' : 'left-1'}`} />
                            </div>
                        </button>
                    </div>

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
                        <span className="atlas-label text-[8px] mb-3 block opacity-50">Filter by Headway</span>
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
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] atlas-mono text-[var(--text-muted)]">{tierCounts[id] || 0}</span>
                                    {activeTiers.has(id) ? (
                                        <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                                            <div className="w-1 h-1 rounded-full bg-white" />
                                        </div>
                                    ) : (
                                        <div className="w-3 h-3 rounded-full border border-[var(--border)]" />
                                    )}
                                </div>
                            </button>
                        ))}
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

            <RouteDetailModal 
                isOpen={!!selectedResult}
                onClose={() => setSelectedResult(null)}
                result={selectedResult}
            />
        </div>
    );
}