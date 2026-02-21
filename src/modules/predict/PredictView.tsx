import React, { useState } from 'react';
import { Layers, Activity, Zap, TrendingUp, Users, MapPin, Search, Filter, Play } from 'lucide-react';
import { PredictProvider, usePredict } from './PredictContext';
import PredictMap from './components/PredictMap';

const PredictViewContent: React.FC = () => {
    const {
        loading,
        demandPoints,
        opportunityPoints,
        runAnalysis,
        params,
        setParams
    } = usePredict();
    const [viewMode, setViewMode] = useState<'demand' | 'supply' | 'opportunity'>('demand');

    return (
        <div className="module-container">
            <div className="flex flex-col gap-6 py-8">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-6">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-600 dark:text-blue-400">
                            <Zap className="w-5 h-5 transition-transform group-hover:scale-110" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="atlas-h2">Predict</h1>
                            <p className="text-xs text-[var(--text-muted)] font-medium mt-1">Map transit deserts and system intelligence zones.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[var(--item-bg)]/40 backdrop-blur-xl p-1 rounded-2xl border border-[var(--border)] shadow-xl">
                        {[
                            { id: 'demand', label: 'Demand', color: 'indigo' },
                            { id: 'supply', label: 'Supply', color: 'emerald' },
                            { id: 'opportunity', label: 'Opportunity', color: 'blue' }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setViewMode(mode.id as any)}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${viewMode === mode.id
                                    ? mode.id === 'demand' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 px-6 scale-105 relative z-10'
                                        : mode.id === 'supply' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 px-6 scale-105 relative z-10'
                                            : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 px-6 scale-105 relative z-10'
                                    : 'text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--item-bg)]'}`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="precision-panel p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <Users className="w-4 h-4 text-indigo-500" />
                            <h3 className="atlas-h3 !text-lg">Demand Nodes</h3>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-black atlas-mono">{demandPoints.length}</span>
                            <span className="atlas-label">Sampled Analysis Points</span>
                        </div>
                        <p className="atlas-label leading-relaxed !text-[var(--text-muted)]">
                            Cross-referencing high-density residential clusters with major employment hubs.
                        </p>
                    </div>

                    <div className="precision-panel p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            <h3 className="atlas-h3 !text-lg">Supply Coverage</h3>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-black atlas-mono">500m</span>
                            <span className="atlas-label">Walking Buffer Radius</span>
                        </div>
                        <p className="atlas-label leading-relaxed !text-[var(--text-muted)]">
                            Areas outside of a 5-minute walk from frequent transit (headway &lt; 15 min).
                        </p>
                    </div>

                    <div className="precision-panel p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-4 h-4 text-purple-500" />
                            <h3 className="atlas-h3 !text-lg">Gap Analysis</h3>
                        </div>
                        <button
                            onClick={runAnalysis}
                            disabled={loading}
                            className={`w-full btn-primary !py-4 justify-center !text-sm group ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <Activity className="w-4 h-4 animate-spin" />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                                    <span>Analyze Service Gaps</span>
                                </div>
                            )}
                        </button>
                        <p className="atlas-label text-center">
                            Scores locations based on the "Gap Index"
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3 precision-panel h-[600px] relative overflow-hidden group">
                        <PredictMap viewMode={viewMode} />

                        <div className="absolute bottom-6 left-6 z-[1000] glass-panel p-4 shadow-2xl w-64 pointer-events-auto border-l-4" style={{ borderColor: viewMode === 'demand' ? '#6366f1' : viewMode === 'supply' ? '#10b981' : '#2563eb' }}>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="atlas-label">Analysis Resolution</span>
                                    <span className="atlas-mono text-[10px]">{params.resolution}km</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="2"
                                    step="0.1"
                                    value={params.resolution}
                                    onChange={(e) => setParams({ ...params, resolution: parseFloat(e.target.value) })}
                                    className="w-full accent-indigo-500 cursor-pointer"
                                />
                                <div className="pt-2 border-t border-[var(--border)]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="atlas-label uppercase tracking-widest">{viewMode} Overlay</span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-3 h-3 rounded-full ${viewMode === 'demand' ? 'bg-indigo-500' : viewMode === 'supply' ? 'bg-emerald-500' : 'bg-blue-600 shadow-sm shadow-blue-500/50'}`} />
                                            <span className="text-[10px] font-bold text-[var(--fg)]">
                                                {viewMode === 'demand' ? 'High Population/Jobs' : viewMode === 'supply' ? 'Frequent Transit Service' : 'System Service Gap'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-3 h-3 rounded-full opacity-20 ${viewMode === 'demand' ? 'bg-indigo-500' : viewMode === 'supply' ? 'bg-emerald-500' : 'bg-blue-600'}`} />
                                            <span className="text-[10px] font-bold text-[var(--text-muted)]">
                                                {viewMode === 'demand' ? 'Low Intensity' : viewMode === 'supply' ? 'Infrequent Service' : 'Well Served / No Demand'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="precision-panel p-6 flex flex-col gap-6 bg-[var(--item-bg)]/30">
                        <div className="flex items-center gap-3">
                            <Activity className="w-4 h-4 text-blue-500" />
                            <h3 className="atlas-h3 !text-lg">Intelligence Zones</h3>
                        </div>

                        {opportunityPoints.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-[var(--border)] rounded-2xl">
                                <Search className="w-8 h-8 text-[var(--text-muted)] mb-3 opacity-20" />
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider leading-relaxed">
                                    No intelligence data.<br />Click "Analyze Service Gaps" to begin.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 overflow-y-auto max-h-[460px] pr-2 custom-scrollbar">
                                {opportunityPoints
                                    .sort((a, b) => b.opportunityScore - a.opportunityScore)
                                    .slice(0, 8)
                                    .map((p, i) => (
                                        <div key={i} className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-xl hover:border-blue-500/30 hover:shadow-lg transition-all group cursor-pointer">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black atlas-mono text-blue-500">ZONE {String(i + 1).padStart(2, '0')}</span>
                                                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 text-[9px] font-black">{p.opportunityScore}% Gap</span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between text-[11px] font-bold">
                                                    <span className="text-[var(--text-muted)]">Population</span>
                                                    <span>{p.population.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-[11px] font-bold">
                                                    <span className="text-[var(--text-muted)]">Current Supply</span>
                                                    <span>{Math.round(p.supply * 100)}%</span>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-[var(--border)] flex justify-end">
                                                <button className="text-[9px] font-black text-indigo-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                                    View Intelligence →
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}

                        <div className="mt-auto space-y-2">
                            <button className="w-full btn-secondary justify-center !py-3">
                                Export Gap Report
                            </button>
                            <p className="text-[9px] text-center text-[var(--text-muted)] font-medium">
                                Data generated using Atlas Predict Engine
                            </p>
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
