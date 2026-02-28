import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { RouteConfig, AvailableRoute, getAvailableRoutes, buildRouteConfig } from './data/routeData';
import { SimulationParams, SimulationResult, DEFAULT_PARAMS, runSimulation, StopOverride } from './engine/simulationEngine';
import { fetchLiveAlerts, Alert, AgencyConfig } from '../../services/alertService';
import { useTransitStore } from '../../types/store';

interface SimulatorContextType {
    selectedRouteId: string;
    setSelectedRouteId: (id: string) => void;
    params: SimulationParams;
    setParams: (params: SimulationParams) => void;
    routeData: RouteConfig | null;
    enabledStopIds: Set<string>;
    availableRoutes: AvailableRoute[];
    toggleStop: (stopId: string) => void;
    resetStops: () => void;
    removeEveryOtherStop: () => void;
    clearNonTerminalStops: () => void;
    simulationResult: SimulationResult | null;
    baselineResult: SimulationResult | null;
    liveAlerts: Alert[];
    alertsLoading: boolean;
    loading: boolean;
    hasGtfsData: boolean;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    stopOverrides: Record<string, StopOverride>;
    setStopOverride: (stopId: string, override: StopOverride | null) => void;
}

const SimulatorContext = createContext<SimulatorContextType | undefined>(undefined);

export const SimulatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { gtfsData, loadPersistedData } = useTransitStore();

    const [selectedRouteId, setSelectedRouteId] = useState('');
    const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
    const [routeData, setRouteData] = useState<RouteConfig | null>(null);
    const [enabledStopIds, setEnabledStopIds] = useState<Set<string>>(new Set());
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [loading, setLoading] = useState(true);
    const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [stopOverrides, setStopOverrides] = useState<Record<string, StopOverride>>({});

    // Agency config for alerts — can be extended to store in IndexedDB later
    const [agencyConfig] = useState<AgencyConfig | null>(null);

    // Load persisted GTFS data on mount
    useEffect(() => {
        if (!gtfsData) {
            loadPersistedData();
        }
    }, [loadPersistedData, gtfsData]);

    // Derive available routes from GTFS data
    const availableRoutes = useMemo(() => {
        if (!gtfsData) return [];
        return getAvailableRoutes(gtfsData);
    }, [gtfsData]);

    // Auto-select first route when GTFS data loads
    useEffect(() => {
        if (availableRoutes.length > 0 && !selectedRouteId) {
            setSelectedRouteId(availableRoutes[0].id);
        }
    }, [availableRoutes, selectedRouteId]);

    // Build route config from GTFS when route selection changes
    useEffect(() => {
        if (!gtfsData || !selectedRouteId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const routeIndex = availableRoutes.findIndex(r => r.id === selectedRouteId);
            const config = buildRouteConfig(gtfsData, selectedRouteId, '0', routeIndex);
            setRouteData(config);
            if (config) {
                setEnabledStopIds(new Set(config.stops.map(s => s.id)));
            }
        } catch {
            setRouteData(null);
        } finally {
            setLoading(false);
        }
    }, [gtfsData, selectedRouteId, availableRoutes]);

    // Load live alerts (only if agency config provides an endpoint)
    useEffect(() => {
        if (!selectedRouteId || !agencyConfig?.alertsUrl) {
            setLiveAlerts([]);
            setAlertsLoading(false);
            return;
        }

        async function getAlerts() {
            setAlertsLoading(true);
            const alerts = await fetchLiveAlerts(selectedRouteId, agencyConfig);
            setLiveAlerts(alerts);
            setAlertsLoading(false);
        }
        getAlerts();
        const interval = setInterval(getAlerts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [selectedRouteId, agencyConfig]);

    const toggleStop = useCallback((stopId: string) => {
        setEnabledStopIds(prev => {
            const next = new Set(prev);
            if (next.has(stopId)) next.delete(stopId);
            else next.add(stopId);
            return next;
        });
    }, []);

    const setStopOverride = useCallback((stopId: string, override: StopOverride | null) => {
        setStopOverrides(prev => {
            const next = { ...prev };
            if (override === null) delete next[stopId];
            else next[stopId] = override;
            return next;
        });
    }, []);

    const resetStops = useCallback(() => {
        if (!routeData) return;
        setEnabledStopIds(new Set(routeData.stops.map(s => s.id)));
    }, [routeData]);

    const removeEveryOtherStop = useCallback(() => {
        if (!routeData) return;
        const newSet = new Set<string>();
        let skipNext = false;
        routeData.stops.forEach(stop => {
            if (stop.isTerminal) {
                newSet.add(stop.id);
            } else if (!skipNext) {
                newSet.add(stop.id);
                skipNext = true;
            } else {
                skipNext = false;
            }
        });
        setEnabledStopIds(newSet);
    }, [routeData]);

    const clearNonTerminalStops = useCallback(() => {
        if (!routeData) return;
        const terminalIds = routeData.stops
            .filter(s => s.isTerminal)
            .map(s => s.id);
        setEnabledStopIds(new Set(terminalIds));
    }, [routeData]);

    const simulationResult = useMemo(() => {
        if (!routeData) return null;
        return runSimulation(routeData.stops, enabledStopIds, params, stopOverrides);
    }, [routeData, enabledStopIds, params, stopOverrides]);

    const baselineResult = useMemo(() => {
        if (!routeData) return null;
        const allIds = new Set<string>(routeData.stops.map(s => s.id));
        // Baseline must represent the unmodified system — no per-stop overrides
        return runSimulation(routeData.stops, allIds, params, {});
    }, [routeData, params]);

    const value = {
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
        simulationResult,
        baselineResult,
        liveAlerts,
        alertsLoading,
        loading,
        hasGtfsData: !!gtfsData,
        sidebarOpen,
        setSidebarOpen,
        stopOverrides,
        setStopOverride,
    };

    return <SimulatorContext.Provider value={value}>{children}</SimulatorContext.Provider>;
};

export const useSimulator = () => {
    const context = useContext(SimulatorContext);
    if (context === undefined) {
        throw new Error('useSimulator must be used within a SimulatorProvider');
    }
    return context;
};
