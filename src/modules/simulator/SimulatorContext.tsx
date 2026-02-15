import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { RouteConfig, AVAILABLE_ROUTES } from './data/routeData';
import { SimulationParams, SimulationResult, DEFAULT_PARAMS, runSimulation, StopOverride } from './engine/simulationEngine';
import { fetchLiveAlerts, Alert } from '../../services/ttcAlerts';

interface SimulatorContextType {
    selectedRouteId: string;
    setSelectedRouteId: (id: string) => void;
    params: SimulationParams;
    setParams: (params: SimulationParams) => void;
    routeData: RouteConfig | null;
    enabledStopIds: Set<string>;
    toggleStop: (stopId: string) => void;
    resetStops: () => void;
    removeEveryOtherStop: () => void;
    clearNonTerminalStops: () => void;
    simulationResult: SimulationResult | null;
    baselineResult: SimulationResult | null;
    liveAlerts: Alert[];
    alertsLoading: boolean;
    loading: boolean;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    stopOverrides: Record<string, StopOverride>;
    setStopOverride: (stopId: string, override: StopOverride | null) => void;
}

const SimulatorContext = createContext<SimulatorContextType | undefined>(undefined);

export const SimulatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selectedRouteId, setSelectedRouteId] = useState(AVAILABLE_ROUTES[0].id);
    const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
    const [routeData, setRouteData] = useState<RouteConfig | null>(null);
    const [enabledStopIds, setEnabledStopIds] = useState<Set<string>>(new Set());
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [loading, setLoading] = useState(true);
    const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
    const [alertsLoading, setAlertsLoading] = useState(true);
    const [stopOverrides, setStopOverrides] = useState<Record<string, StopOverride>>({});

    // Load route data
    useEffect(() => {
        async function loadRoute() {
            try {
                setLoading(true);
                const response = await fetch(`/data/routes/${selectedRouteId}.json`);
                if (!response.ok) throw new Error('Route not found');
                const data: RouteConfig = await response.json();
                setRouteData(data);
                setEnabledStopIds(new Set(data.stops.map(s => s.id)));
            } catch (error) {
                console.error('Failed to load route:', error);
            } finally {
                setLoading(false);
            }
        }
        loadRoute();
    }, [selectedRouteId]);

    // Load live alerts
    useEffect(() => {
        async function getAlerts() {
            setAlertsLoading(true);
            const alerts = await fetchLiveAlerts(selectedRouteId);
            setLiveAlerts(alerts);
            setAlertsLoading(false);
        }
        getAlerts();
        const interval = setInterval(getAlerts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [selectedRouteId]);

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
        return runSimulation(routeData.stops, allIds, params, stopOverrides);
    }, [routeData, params, stopOverrides]);

    const value = {
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
        simulationResult,
        baselineResult,
        liveAlerts,
        alertsLoading,
        loading,
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
