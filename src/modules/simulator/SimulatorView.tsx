import { useEffect, useCallback } from 'react';
import { useSimulator, SimulatorProvider } from './SimulatorContext';
import RouteSelector from './components/RouteSelector';
import SimulatorMap from './components/SimulatorMap';
import MetricsPanel from './components/MetricsPanel';
import ControlPanel from './components/ControlPanel';
import { EmptyStateHero } from '../../components/EmptyStateHero';
import { Activity, Database, PanelRightOpen, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function SimulatorViewContent() {
    const {
        selectedRouteId,
        setSelectedRouteId,
        params,
        setParams,
        routeData,
        enabledStopIds,
        availableRoutes,
        toggleStop,
        resetStops,
        removeEveryOtherStop,
        clearNonTerminalStops,
        simulationResult: result,
        baselineResult,
        liveAlerts,
        alertsLoading,
        loading,
        hasGtfsData,
        sidebarOpen,
        setSidebarOpen,
        stopOverrides,
        setStopOverride,
    } = useSimulator();

    // Keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't fire when typing in inputs
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        switch (e.key.toLowerCase()) {
            case 's': setSidebarOpen(!sidebarOpen); break;
            case 'r': resetStops(); break;
            case '1': removeEveryOtherStop(); break;
            case '2': clearNonTerminalStops(); break;
        }
    }, [sidebarOpen, setSidebarOpen, resetStops, removeEveryOtherStop, clearNonTerminalStops]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    if (!hasGtfsData) {
        return (
            <div className="module-container">
                <EmptyStateHero
                    icon={Activity}
                    title="Simulate"
                    description="Model stop consolidation scenarios with real-time performance metrics. Upload a GTFS feed to begin."
                    primaryAction={{
                        label: "Open Admin Panel",
                        icon: Database,
                        href: "/admin"
                    }}
                    features={[
                        { icon: <Activity />, title: 'Stop Consolidation', desc: 'Toggle stops and see travel time impact instantly.' },
                        { icon: <Database />, title: 'GTFS-Powered', desc: 'Uses your uploaded GTFS data — any agency, any city.' },
                    ]}
                />
            </div>
        );
    }

    if (loading || !routeData || !result || !baselineResult) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-12 h-12 border-4 border-[var(--border)] border-t-indigo-500 rounded-full animate-spin" />
                <p className="atlas-label">
                    Initialising Engine...
                </p>
            </div>
        );
    }

    // Determine Live Status Display
    const hasAlerts = liveAlerts.length > 0;
    const criticalAlert = liveAlerts.find(a => a.severity === 'Critical');
    const majorAlert = liveAlerts.find(a => a.severity === 'Major');

    let statusType: 'normal' | 'major' | 'critical' | 'loading' = 'normal';
    let statusText = 'Service Normal';

    if (alertsLoading) {
        statusType = 'loading';
        statusText = 'Checking Status...';
    } else if (hasAlerts) {
        if (criticalAlert) {
            statusType = 'critical';
            statusText = 'Service Suspended';
        } else {
            statusType = 'major';
            statusText = majorAlert ? 'Major Delays' : 'Minor Delays';
        }
    }

    const badgeStyles = {
        normal: 'status-bullet-emerald',
        major: 'status-bullet-amber',
        critical: 'status-bullet-red',
        loading: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
    };

    return (
        <div className="app-container">
            {/* Map Layer */}
            <div className="map-container">
                <SimulatorMap
                    stops={routeData.stops}
                    shape={routeData.shape}
                    enabledStopIds={enabledStopIds}
                    onToggleStop={toggleStop}
                />

                {/* HUD Elements */}
                <div className="floating-header px-6">
                    <div className="header-title flex-grow max-w-xl">
                        <div className="flex items-center gap-4">
                            <RouteSelector
                                selectedRouteId={selectedRouteId}
                                onRouteSelect={setSelectedRouteId}
                                routes={availableRoutes}
                            />

                            {/* Live Status Badge */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                title={hasAlerts ? liveAlerts[0].description : 'No active alerts'}
                                className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-[var(--item-bg)]/40 backdrop-blur-xl border border-[var(--border)] rounded-2xl cursor-help shadow-sm group hover:border-indigo-500/30 transition-all"
                            >
                                {statusType === 'loading' ? (
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                ) : (
                                    <div className="relative">
                                        <span className={`status-bullet ${badgeStyles[statusType]} w-2.5 h-2.5`} />
                                        {statusType !== 'normal' && (
                                            <span className={`absolute inset-0 rounded-full ${badgeStyles[statusType]} animate-ping opacity-75`} />
                                        )}
                                    </div>
                                )}
                                <span className="atlas-label text-[11px] text-[var(--fg)] tracking-tight normal-case font-bold">{statusText}</span>
                            </motion.div>
                        </div>
                    </div>
                </div>

                {/* HUD Footer Stats */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="floating-stats flex items-center divide-x divide-[var(--border)] overflow-hidden glass-panel rounded-3xl p-1 shadow-2xl border border-white/10"
                >
                    <div className="px-6 py-3 flex flex-col items-center group cursor-default">
                        <span className="text-xl font-black atlas-mono tracking-tighter text-indigo-500">{result.numberOfStops}</span>
                        <span className="atlas-label text-[9px] opacity-70 group-hover:opacity-100 transition-opacity">Active Stops</span>
                    </div>
                    <div className="px-6 py-3 flex flex-col items-center group cursor-default">
                        <span className="text-xl font-black atlas-mono tracking-tighter text-[var(--text-muted)]">{result.stopsRemoved}</span>
                        <span className="atlas-label text-[9px] opacity-70 group-hover:opacity-100 transition-opacity">Removed</span>
                    </div>
                    <div className="px-8 py-3 flex flex-col items-center group cursor-default bg-indigo-500/5">
                        <motion.span
                            key={result.timeSavedSeconds}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`text-xl font-black atlas-mono tracking-tighter ${result.timeSavedSeconds > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}
                        >
                            {Math.abs(Math.round(result.timeSavedSeconds / 60))}m {Math.abs(Math.round(result.timeSavedSeconds % 60))}s
                        </motion.span>
                        <span className="atlas-label text-[9px] text-emerald-500/80 font-black">
                            {result.timeSavedSeconds >= 0 ? 'Time Saved' : 'Time Added'}
                        </span>
                    </div>
                </motion.div>

                {/* Sidebar Re-open Toggle */}
                <AnimatePresence>
                    {!sidebarOpen && (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setSidebarOpen(true)}
                            title="Open Console"
                            className="absolute top-8 right-8 z-[100] p-3 glass-panel rounded-2xl border border-[var(--border)] hover:border-indigo-500/40 shadow-lg hover:shadow-xl transition-all group"
                        >
                            <PanelRightOpen className="w-5 h-5 text-[var(--text-muted)] group-hover:text-indigo-500 transition-colors" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Control Console Overlay */}
            <div className={`sidebar glass-panel ${sidebarOpen ? 'open' : 'closed'} border-l border-[var(--border)] shadow-2xl`}>
                <div className="p-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--item-bg)]/30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-indigo-500" />
                        </div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-[var(--fg)]">Logic Engine</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            className="p-2 hover:bg-[var(--item-bg)] rounded-xl transition-colors text-[var(--text-muted)] hover:text-indigo-500"
                            title="Export Scenario"
                            onClick={() => {
                                const scenario = {
                                    route: routeData.name,
                                    routeId: selectedRouteId,
                                    exportedAt: new Date().toISOString(),
                                    parameters: params,
                                    baseline: {
                                        totalTimeFormatted: baselineResult.formattedTime,
                                        totalTimeSeconds: baselineResult.totalTimeSeconds,
                                        stops: baselineResult.numberOfStops,
                                        averageSpeedKmh: baselineResult.averageSpeedKmh,
                                    },
                                    simulation: {
                                        totalTimeFormatted: result.formattedTime,
                                        totalTimeSeconds: result.totalTimeSeconds,
                                        stops: result.numberOfStops,
                                        stopsRemoved: result.stopsRemoved,
                                        timeSavedSeconds: result.timeSavedSeconds,
                                        averageSpeedKmh: result.averageSpeedKmh,
                                        maxGapMeters: result.maxGapMeters,
                                        maxGapBetween: result.maxWalkingGapStops,
                                    },
                                    removedStops: routeData.stops
                                        .filter(s => !enabledStopIds.has(s.id))
                                        .map(s => ({ id: s.id, name: s.name })),
                                    overrides: Object.entries(stopOverrides).map(([id, o]) => ({ stopId: id, ...o })),
                                };
                                const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `atlas-sim-${selectedRouteId}-${Date.now()}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                            }}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            className="p-2 hover:bg-[var(--item-bg)] rounded-xl transition-colors"
                            onClick={() => setSidebarOpen(false)}
                            title="Close (S)"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <MetricsPanel
                        result={result}
                        baselineResult={baselineResult}
                        params={params}
                        routeId={selectedRouteId}
                        routeColor={routeData.color}
                    />
                    <div className="h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent mx-8 my-4" />
                    <ControlPanel
                        params={params}
                        onParamsChange={setParams}
                        onToggleStop={toggleStop}
                        stops={routeData.stops}
                        enabledStopIds={enabledStopIds}
                        onResetStops={resetStops}
                        onRemoveEveryOther={removeEveryOtherStop}
                        onClearNonTerminal={clearNonTerminalStops}
                        stopOverrides={stopOverrides}
                        onStopOverrideChange={setStopOverride}
                    />
                </div>
            </div>
        </div>
    );
}

export default function SimulatorView() {
    return (
        <SimulatorProvider>
            <SimulatorViewContent />
        </SimulatorProvider>
    );
}
