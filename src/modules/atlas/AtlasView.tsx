import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, ZoomControl, Popup, useMap } from 'react-leaflet';
import { RotateCcw, Activity, Globe, Info } from 'lucide-react';
import { useCatalogStore } from '../../types/catalogStore';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import type { LatLngBoundsExpression } from 'leaflet';
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
    const { currentRoutes, loading, loadCatalog } = useCatalogStore();
    const [activeDay, setActiveDay] = useState('Weekday');
    const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set(['5', '8', '10', '15', '20']));
    const [mapStyle, setMapStyle] = useState<'dark' | 'light'>('dark');
    const [activeAgency, setActiveAgency] = useState<string | null>(null);

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

    const filteredMapData = useMemo(() => {
        return currentRoutes
            .filter(r => r.dayType === activeDay)
            .filter(r => activeTiers.size === 0 || activeTiers.has(r.tier))
            .filter(r => !activeAgency || r.agencyId === activeAgency)
            .filter(r => r.shape && r.shape.length > 0)
            .map(r => ({
                ...r,
                color: TIER_COLORS[r.tier] || '#64748b',
            }));
    }, [currentRoutes, activeDay, activeTiers, activeAgency]);

    // Compute bounds from all displayed routes
    const bounds = useMemo((): LatLngBoundsExpression | null => {
        if (filteredMapData.length === 0) return null;
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        for (const r of filteredMapData) {
            for (const [lat, lng] of r.shape) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            }
        }
        if (minLat === 90) return null;
        return [[minLat, minLng], [maxLat, maxLng]];
    }, [filteredMapData]);

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

    if (currentRoutes.length === 0) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={Globe}
                    title="Atlas Empty"
                    description="No routes in the catalog yet. Upload a GTFS feed in the Screen module, then commit routes to the catalog."
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
                                <h1 className="text-lg font-black tracking-tight leading-none text-[var(--fg)]">Atlas</h1>
                                <p className="text-[9px] atlas-label !text-emerald-600 mt-1 uppercase font-black tracking-wider">
                                    {agencies.length} {agencies.length === 1 ? 'Agency' : 'Agencies'}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setActiveTiers(new Set(Object.keys(TIER_LABELS)))}>
                            <RotateCcw className="w-4 h-4 text-[var(--text-muted)] hover:text-emerald-500 transition-colors" />
                        </button>
                    </header>

                    {/* Agency Filter (only if multiple) */}
                    {agencies.length > 1 && (
                        <div className="mb-6">
                            <span className="atlas-label text-[8px] mb-2 block opacity-50">Agency</span>
                            <div className="space-y-1">
                                <button
                                    onClick={() => setActiveAgency(null)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${!activeAgency ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                                >
                                    All Agencies
                                </button>
                                {agencies.map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => setActiveAgency(a.id === activeAgency ? null : a.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${activeAgency === a.id ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'text-[var(--text-muted)] hover:text-[var(--fg)]'}`}
                                    >
                                        {a.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

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

                <div className="glass-panel p-4 pointer-events-auto border border-white/5 shadow-xl flex items-center gap-4">
                    <div className="flex-1">
                        <div className="atlas-label text-[10px] text-emerald-500 flex items-center gap-2 mb-1">
                            <Info className="w-3 h-3" /> Catalog
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] leading-snug font-medium">
                            Showing {filteredMapData.length} routes from {agencies.length} {agencies.length === 1 ? 'agency' : 'agencies'}.
                        </p>
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
