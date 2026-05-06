import { useEffect, useCallback, useState } from 'react';
import { useSimulator, SimulatorProvider } from './SimulatorContext';
import RouteSelector from './components/RouteSelector';
import SimulatorMap from './components/SimulatorMap';
import MetricsPanel from './components/MetricsPanel';
import ControlPanel from './components/ControlPanel';
import { Activity, PanelRightOpen, Download, Scissors, Play, FileCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useViewAs } from '../../hooks/useViewAs';
import { useAuthStore } from '../../hooks/useAuthStore';
import { ModuleSubNav } from '../../components/ModuleSubNav';
import { ModuleIntro } from '../../components/ModuleIntro';

type TabId = 'optimizer' | 'scenarios' | 'reporting';

function SimulatorViewContent() {
    const { role } = useAuthStore();
    const { viewAsAgency } = useViewAs();
    const isAdmin = role === 'admin' || role === 'researcher';
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

    const [tab, setTab] = useState<TabId>('optimizer');

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

    if (!hasGtfsData && !loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <Activity className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
                <p className="text-[15px] font-bold text-[var(--fg)]">
                    {isAdmin && !viewAsAgency ? 'Select an agency to begin' : 'No routes available'}
                </p>
                <p className="text-[13px] text-[var(--text-muted)] max-w-xs">
                    {isAdmin && !viewAsAgency
                        ? 'Use the Agency button in the top navigation to pick an agency, then Simulate will load its routes.'
                        : 'No GTFS routes are available for this agency yet.'}
                </p>
            </div>
        );
    }

    if (loading || !routeData || !result || !baselineResult) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-12 h-12 border-4 border-[var(--border)] border-t-indigo-500 rounded-full animate-spin" />
                <p className="atlas-label">
                    Loading...
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
        <div className="module-container p-0 overflow-hidden flex flex-col h-screen">
            <div className="px-6 pt-4 shrink-0">
                <ModuleIntro
                    subtitle="Model stop changes, compare scenarios, and export impact snapshots for the selected route."
                    actions={
                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
                            Pro
                        </span>
                    }
                />

                <ModuleSubNav
                    tabs={[
                        { id: 'optimizer', label: 'Optimizer', icon: Scissors },
                        { id: 'scenarios', label: 'Scenarios', icon: Play },
                        { id: 'reporting', label: 'Report', icon: FileCheck }
                    ]}
                    activeTab={tab}
                    onTabChange={setTab}
                />

                <div className="mb-4 text-[12px] text-[var(--text-muted)]">
                    {tab === 'optimizer' && 'Trim stops, test travel-time savings, and compare against the baseline pattern.'}
                    {tab === 'scenarios' && 'Experiment with operating assumptions and route-level intervention ideas.'}
                    {tab === 'reporting' && 'Package the current scenario into an exportable impact summary.'}
                </div>
            </div>

            <div className="flex-1 relative mt-2">
                {/* Map Layer */}
                <div className="absolute inset-0">
                    <SimulatorMap
                        stops={routeData.stops}
                        shape={routeData.shape}
                        enabledStopIds={enabledStopIds}
                        onToggleStop={toggleStop}
                    />

                    {/* HUD Header (Now just internal route selector) */}
                    <div className="absolute top-6 left-6 z-[80]">
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
                                className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl cursor-help shadow-2xl group hover:border-indigo-500/30 transition-all"
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
                                <span className="atlas-label text-[11px] text-white tracking-tight normal-case font-bold">{statusText}</span>
                            </motion.div>
                        </div>
                    </div>

                    {/* HUD Footer Stats */}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center divide-x divide-white/5 overflow-hidden bg-black/80 backdrop-blur-2xl rounded-3xl p-1 shadow-2xl border border-white/10"
                    >
                        <div className="px-6 py-3 flex flex-col items-center group cursor-default">
                            <span className="text-xl font-black atlas-mono tracking-tighter text-indigo-400">{result.numberOfStops}</span>
                            <span className="atlas-label text-[9px] text-white/50 group-hover:opacity-100 transition-opacity">Active Stops</span>
                        </div>
                        <div className="px-6 py-3 flex flex-col items-center group cursor-default">
                            <span className="text-xl font-black atlas-mono tracking-tighter text-white/30">{result.stopsRemoved}</span>
                            <span className="atlas-label text-[9px] text-white/50 group-hover:opacity-100 transition-opacity">Removed</span>
                        </div>
                        <div className="px-8 py-3 flex flex-col items-center group cursor-default bg-indigo-500/10">
                            <motion.span
                                key={result.timeSavedSeconds}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`text-xl font-black atlas-mono tracking-tighter ${result.timeSavedSeconds > 0 ? 'text-emerald-400' : 'text-white/40'}`}
                            >
                                {Math.abs(Math.round(result.timeSavedSeconds / 60))}m {Math.abs(Math.round(result.timeSavedSeconds % 60))}s
                            </motion.span>
                            <span className="atlas-label text-[9px] text-emerald-400/80 font-black">
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
                                className="absolute top-6 right-6 z-[100] p-3 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-indigo-500/40 shadow-2xl hover:shadow-indigo-500/20 transition-all group"
                            >
                                <PanelRightOpen className="w-5 h-5 text-white/60 group-hover:text-indigo-400 transition-colors" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* Control Console Overlay */}
                <div className={`absolute top-0 right-0 bottom-0 w-[400px] z-[90] bg-[var(--bg)]/95 backdrop-blur-2xl border-l border-[var(--border)] shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="p-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--item-bg)]/30">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-indigo-500" />
                            </div>
                            <h2 className="text-sm font-bold text-[var(--fg)]">Controls</h2>
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
