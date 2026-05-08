import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { RouteConfig, AvailableRoute } from './data/routeData';
import { SimulationParams, SimulationResult, DEFAULT_PARAMS, runSimulation, StopOverride } from './engine/simulationEngine';
import { fetchLiveAlerts, Alert, AgencyConfig } from '../../services/alertService';
import { fetchSimulateRoutes, fetchSimulateRoute } from '../../services/atlasApi';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useViewAs } from '../../hooks/useViewAs';

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
    const { role, agencyId: userAgencyId } = useAuthStore();
    const { viewAsAgency } = useViewAs();
    const isAdmin = role === 'admin' || role === 'researcher';
    const agencySlug = isAdmin ? (viewAsAgency?.slug ?? '') : (userAgencyId ?? '');

    const [selectedRouteId, setSelectedRouteId] = useState('');
    const [availableRoutes, setAvailableRoutes] = useState<AvailableRoute[]>([]);
    const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
    const [routeData, setRouteData] = useState<RouteConfig | null>(null);
    const [enabledStopIds, setEnabledStopIds] = useState<Set<string>>(new Set());
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [loading, setLoading] = useState(false);
    const [routesLoading, setRoutesLoading] = useState(false);
    const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [stopOverrides, setStopOverrides] = useState<Record<string, StopOverride>>({});

    const [agencyConfig] = useState<AgencyConfig | null>(null);

    // Fetch route list when agency changes
    useEffect(() => {
        if (!agencySlug) {
            setAvailableRoutes([]);
            setSelectedRouteId('');
            setRouteData(null);
            return;
        }
        setRoutesLoading(true);
        fetchSimulateRoutes(agencySlug)
            .then(routes => {
                setAvailableRoutes(routes);
                if (routes.length > 0) setSelectedRouteId(routes[0].id);
            })
            .catch(console.error)
            .finally(() => setRoutesLoading(false));
    }, [agencySlug]);

    // Fetch route detail when selected route changes
    useEffect(() => {
        if (!agencySlug || !selectedRouteId) {
            setRouteData(null);
            return;
        }
        setLoading(true);
        fetchSimulateRoute(agencySlug, selectedRouteId)
            .then(detail => {
                const config: RouteConfig = {
                    id: detail.id,
                    name: detail.name,
                    color: detail.color,
                    stops: detail.stops,
                    shape: detail.shape,
                };
                setRouteData(config);
                setEnabledStopIds(new Set(config.stops.map(s => s.id)));
                setStopOverrides({});
            })
            .catch(() => setRouteData(null))
            .finally(() => setLoading(false));
    }, [agencySlug, selectedRouteId]);

    // Live alerts
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
        setEnabledStopIds(new Set(routeData.stops.filter(s => s.isTerminal).map(s => s.id)));
    }, [routeData]);

    const simulationResult = useMemo(() => {
        if (!routeData) return null;
        return runSimulation(routeData.stops, enabledStopIds, params, stopOverrides);
    }, [routeData, enabledStopIds, params, stopOverrides]);

    const baselineResult = useMemo(() => {
        if (!routeData) return null;
        return runSimulation(routeData.stops, new Set(routeData.stops.map(s => s.id)), params, {});
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
        loading: loading || routesLoading,
        hasGtfsData: availableRoutes.length > 0,
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
