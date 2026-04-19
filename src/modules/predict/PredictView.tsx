import React, { useState, useRef } from 'react';
import { Layers, Activity, Zap, TrendingUp, Users, MapPin, Search, Filter, Play, Database, ShieldCheck, Clock, Map as MapIcon } from 'lucide-react';
import { PredictProvider, usePredict } from './PredictContext';
import PredictMap from './components/PredictMap';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import { ModuleLanding } from '../../components/ModuleLanding';
import { useAuthStore } from '../../hooks/useAuthStore';

const PredictViewContent: React.FC = () => {
    const { isAuthenticated } = useAuthStore();
    const {
        gtfsData,
        loading,
        demandPoints,
        opportunityPoints,
        runAnalysis,
        params,
        setParams,
        refreshData
    } = usePredict();
    const [viewMode, setViewMode] = useState<'demand' | 'supply' | 'opportunity'>('demand');

    if (!isAuthenticated) {
        return (
            <ModuleLanding
                title="Predict"
                description="Find where your network has gaps. Compares population and employment density against actual transit service to identify underserved areas."
                icon={Zap}
                features={[
                    {
                        title: "Demand mapping",
                        description: "See where people live and work, mapped as density nodes across your service area.",
                        icon: <Users className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Supply coverage",
                        description: "Measure how much of the area is within walking distance of frequent transit service.",
                        icon: <Activity className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Gap detection",
                        description: "Automatically find areas with high demand but little or no transit coverage.",
                        icon: <Zap className="w-5 h-5 text-indigo-500" />
                    },
                    {
                        title: "Adjustable resolution",
                        description: "Control the grid resolution to zoom in on specific neighborhoods or see the big picture.",
                        icon: <MapIcon className="w-5 h-5 text-indigo-500" />
                    }
                ]}
            />
        );
    }

    if (!gtfsData) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={Zap}
                    title="Predict"
                    description="This module requires Census population data loaded into the server. Import a population grid for your agency's region to enable demand mapping and gap detection."
                    features={[
                        { icon: <Users />, title: 'Demand Mapping', desc: 'Identify residential and employment density centers.' },
                        { icon: <Activity />, title: 'Supply Analysis', desc: 'Measure walking-distance access to frequent transit.' },
                        { icon: <Zap />, title: 'Gap Detection', desc: 'Identify areas with high demand but insufficient supply.' }
                    ]}
                />
            </div>
        );
    }

    return (
        <div className="module-container">
            <div className="flex flex-col gap-6 w-full">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-1 bg-[var(--item-bg)] p-1 rounded-lg border border-[var(--border)]">
                        {[
                            { id: 'demand', label: 'Demand' },
                            { id: 'supply', label: 'Supply' },
                            { id: 'opportunity', label: 'Opportunity' }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setViewMode(mode.id as any)}
                                className={`px-4 py-1.5 rounded-md text-[11px] font-semibold transition-colors duration-150 ${viewMode === mode.id
                                    ? 'bg-[var(--accent-primary)] text-white'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel)]'}`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="precision-panel p-6 flex flex-col gap-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4 text-[var(--accent-primary)]" />
                            <span className="atlas-label">Demand Nodes</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold atlas-mono tracking-tighter">{demandPoints.length}</span>
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Active points</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed">
                            Residency-to-employment density mapping enabled for current viewport.
                        </p>
                    </div>

                    <div className="precision-panel p-6 flex flex-col gap-3 border-l-2 border-l-[var(--accent-secondary)]">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-[var(--accent-secondary)]" />
                            <span className="atlas-label">Supply Coverage</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold atlas-mono tracking-tighter">500m</span>
                            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Walk buffer</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed">
                            Walking distance threshold for frequent transit access (15min headway).
                        </p>
                    </div>

                    <div className="precision-panel p-6 flex flex-col gap-4 bg-[var(--panel)]">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp className="w-4 h-4 text-[var(--accent-warning)]" />
                            <span className="atlas-label">Gap Analysis</span>
                        </div>
                        <button
                            onClick={runAnalysis}
                            disabled={loading}
                            className={`btn-primary w-full justify-center group ${loading ? 'opacity-50' : ''}`}
                        >
                            {loading ? (
                                <Activity className="w-4 h-4 animate-spin" />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Run Engine</span>
                                </div>
                            )}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 pb-8">
                    <div className="lg:col-span-3 precision-panel h-[600px] relative overflow-hidden">
                        <PredictMap viewMode={viewMode} />

                        <div className="absolute top-4 right-4 z-[1000] precision-panel p-4 w-60 bg-[var(--bg)] shadow-lg border-l-4" style={{ borderColor: 'var(--accent-primary)' }}>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="atlas-label">Resolution</span>
                                        <span className="atlas-mono text-[10px]">{params.resolution}km</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="2"
                                        step="0.1"
                                        value={params.resolution}
                                        onChange={(e) => setParams({ ...params, resolution: parseFloat(e.target.value) })}
                                        className="w-full accent-[var(--accent-primary)] cursor-pointer"
                                    />
                                </div>
                                <div className="pt-3 border-t border-[var(--border)]">
                                    <span className="atlas-label block mb-3">{viewMode} Overlay</span>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="status-indicator status-emerald" />
                                            <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">High Density</span>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-50">
                                            <div className="status-indicator status-emerald" />
                                            <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Low Density</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="precision-panel flex flex-col bg-[var(--panel)]">
                        <div className="p-4 border-b border-[var(--border)] bg-[var(--item-bg)] flex items-center justify-between">
                            <span className="atlas-label">Intelligence Zones</span>
                            {opportunityPoints.length > 0 && (
                                <div className="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-white text-[9px] font-bold tabular">
                                    MAX {Math.max(...opportunityPoints.map(p => p.opportunityScore))}%
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                            {opportunityPoints.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                    <Search className="w-8 h-8 mb-4 stroke-1" />
                                    <span className="atlas-label">No active <br />analysis data</span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {opportunityPoints
                                        .sort((a, b) => b.opportunityScore - a.opportunityScore)
                                        .slice(0, 10)
                                        .map((p, i) => (
                                            <button key={i} className="flex flex-col gap-2 p-3 bg-[var(--bg)] border border-[var(--border)] rounded-md hover:border-[var(--accent-primary)] transition-all text-left">
                                                <div className="flex items-center justify-between">
                                                    <span className="atlas-mono text-[10px] text-[var(--accent-primary)]">ZONE {String(i + 1).padStart(2, '0')}</span>
                                                    <span className="atlas-mono text-[11px] font-bold font-bold-none">{p.opportunityScore}%</span>
                                                </div>
                                                <div className="flex flex-col gap-1 opacity-70">
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                                        <span>Pop</span>
                                                        <span className="tabular">{p.population.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                                        <span>Supply</span>
                                                        <span className="tabular">{Math.round(p.supply * 100)}%</span>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-[var(--border)] bg-[var(--item-bg)] flex flex-col gap-2">
                            <button className="btn-secondary w-full justify-center text-[10px]">
                                Export Gap Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PredictView: React.FC = () => {
    return (
        <PredictProvider>
            <PredictViewContent />
        </PredictProvider>
    );
};

export default PredictView;
