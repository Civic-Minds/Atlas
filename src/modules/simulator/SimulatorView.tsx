import { useSimulator, SimulatorProvider } from './SimulatorContext';
import RouteSelector from './components/RouteSelector';
import SimulatorMap from './components/SimulatorMap';
import MetricsPanel from './components/MetricsPanel';
import ControlPanel from './components/ControlPanel';

function SimulatorViewContent() {
    const {
        selectedRouteId,
        setSelectedRouteId,
        params,
        setParams,
        routeData,
        enabledStopIds,
        toggleStop,
        resetStops,
        removeEveryOtherStop,
        clearNonTerminalStops,
        simulationResult: result,
        baselineResult,
        liveAlerts,
        alertsLoading,
        loading,
        sidebarOpen,
        setSidebarOpen,
        stopOverrides,
        setStopOverride,
    } = useSimulator();

    if (loading || !routeData || !result || !baselineResult) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-12 h-12 border-4 border-[var(--border)] border-t-indigo-500 rounded-full animate-spin" />
                <p className="atlas-label">
                    Initialising Simulation Engine...
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
        normal: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        major: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        critical: 'bg-red-500/10 text-red-400 border-red-500/20',
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
                <div className="floating-header">
                    <div className="header-title">
                        <div className="flex justify-between items-center gap-3">
                            <RouteSelector
                                selectedRouteId={selectedRouteId}
                                onRouteSelect={setSelectedRouteId}
                            />

                            {/* Live Status Badge */}
                            <div
                                title={hasAlerts ? liveAlerts[0].description : 'No active alerts'}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border cursor-help ${badgeStyles[statusType]}`}
                            >
                                {statusType === 'loading' ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                                ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        {statusType === 'normal' ? (
                                            <polyline points="20 6 9 17 4 12" />
                                        ) : (
                                            <g><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></g>
                                        )}
                                    </svg>
                                )}
                                <span className="atlas-label text-inherit">{statusText}</span>
                            </div>
                        </div>
                        <h1 className="atlas-h2 mt-1">Lab</h1>
                    </div>
                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title={sidebarOpen ? "Minimize Console" : "Open Console"}
                    >
                        {sidebarOpen ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                        )}
                    </button>
                </div>

                {/* HUD Footer Stats */}
                <div className="floating-stats flex items-center divide-x divide-[var(--border)] overflow-hidden">
                    <div className="px-4 py-2 flex flex-col items-center">
                        <span className="text-lg font-black atlas-mono">{result.numberOfStops}</span>
                        <span className="atlas-label">Active Stops</span>
                    </div>
                    <div className="px-4 py-2 flex flex-col items-center">
                        <span className="text-lg font-black atlas-mono">{result.stopsRemoved}</span>
                        <span className="atlas-label">Removed</span>
                    </div>
                    <div className="px-4 py-2 flex flex-col items-center">
                        <span className={`text-lg font-black atlas-mono ${result.timeSavedSeconds > 0 ? 'text-emerald-500' : ''}`}>
                            {Math.round(result.timeSavedSeconds / 60)}m {Math.round(result.timeSavedSeconds % 60)}s
                        </span>
                        <span className="atlas-label">Time Saved</span>
                    </div>
                </div>
            </div>

            {/* Control Console Overlay */}
            <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <MetricsPanel
                    result={result}
                    baselineResult={baselineResult}
                    params={params}
                    routeId={selectedRouteId}
                    routeColor={routeData.color}
                />
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
    );
}

export default function SimulatorView() {
    return (
        <SimulatorProvider>
            <SimulatorViewContent />
        </SimulatorProvider>
    );
}
