import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { GtfsData, AnalysisResult } from '../../utils/gtfsUtils';
import { storage, STORES } from '../../core/storage';

interface DemandPoint {
    lat: number;
    lon: number;
    population: number;
    jobs: number;
    demand: number; // 0-1
}

interface SupplyPoint {
    lat: number;
    lon: number;
    frequencyScore: number; // 0-1 (1 = high frequency)
}

interface OpportunityPoint {
    lat: number;
    lon: number;
    population: number;
    jobs: number;
    demand: number;
    supply: number;
    gap: number; // demand - supply
    opportunityScore: number; // normalized 0-100
}

interface PredictContextType {
    gtfsData: GtfsData | null;
    analysisResults: AnalysisResult[];
    demandPoints: DemandPoint[];
    opportunityPoints: OpportunityPoint[];
    loading: boolean;
    params: {
        resolution: number; // Grid size in km
        demandRadius: number; // km
        supplyRadius: number; // km
    };
    setParams: (params: any) => void;
    runAnalysis: () => void;
}

const PredictContext = createContext<PredictContextType | undefined>(undefined);

export const PredictProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [gtfsData, setGtfsData] = useState<GtfsData | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [params, setParams] = useState({
        resolution: 0.5, // 500m grid
        demandRadius: 0.8,
        supplyRadius: 0.5
    });
    const [opportunityPoints, setOpportunityPoints] = useState<OpportunityPoint[]>([]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const savedGtfs = await storage.getItem<GtfsData>(STORES.GTFS, 'latest');
                const savedResults = await storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest');
                if (savedGtfs) setGtfsData(savedGtfs);
                if (savedResults) setAnalysisResults(savedResults);
            } catch (e) {
                console.error('Predict: Failed to load data', e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Higher fidelity Demand Points (Simulating Census Dissemination Areas)
    const demandPoints = useMemo(() => {
        if (!gtfsData || gtfsData.stops.length === 0) return [];

        const lats = gtfsData.stops.map(s => parseFloat(s.stop_lat));
        const lons = gtfsData.stops.map(s => parseFloat(s.stop_lon));
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // Adjust resolution based on params (approx degrees)
        const latStep = params.resolution / 111;
        const lonStep = params.resolution / (111 * Math.cos(minLat * Math.PI / 180));

        const points: DemandPoint[] = [];

        // Define anchor zones (Simulating Downtown, Tech Hubs, Transit-Oriented Dev)
        const anchors = [
            { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2, range: 0.02, weight: 1.0, type: 'Downtown' },
            { lat: minLat + (maxLat - minLat) * 0.2, lon: minLon + (maxLon - minLon) * 0.3, range: 0.015, weight: 0.8, type: 'Employment' },
            { lat: minLat + (maxLat - minLat) * 0.8, lon: minLon + (maxLon - minLon) * 0.7, range: 0.01, weight: 0.6, type: 'Residential' },
            { lat: minLat + (maxLat - minLat) * 0.4, lon: minLon + (maxLon - minLon) * 0.1, range: 0.012, weight: 0.5, type: 'Suburban' },
        ];

        // Generate grid
        for (let lat = minLat - 0.02; lat <= maxLat + 0.02; lat += latStep) {
            for (let lon = minLon - 0.02; lon <= maxLon + 0.02; lon += lonStep) {
                let score = 0;

                // Add base noise for suburban sprawl
                score += 0.05 * Math.random();

                // Add density from anchors
                anchors.forEach(a => {
                    const dLat = (lat - a.lat);
                    const dLon = (lon - a.lon) * Math.cos(lat * Math.PI / 180);
                    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

                    if (dist < a.range) {
                        // Gaussian-like falloff
                        score += a.weight * Math.exp(-(dist * dist) / (2 * Math.pow(a.range / 2, 2)));
                    }
                });

                // Normalized population mapping
                if (score > 0.02) {
                    points.push({
                        lat,
                        lon,
                        population: Math.round(score * 12000), // Max ~12k people per cell
                        jobs: Math.round(score * 4000),
                        demand: Math.min(score, 1.0)
                    });
                }
            }
        }
        return points;
    }, [gtfsData, params.resolution]);

    const runAnalysis = () => {
        if (!gtfsData || !analysisResults.length || !demandPoints.length) {
            console.warn('Predict: Missing data for analysis');
            return;
        }

        setLoading(true);

        // Pre-index stops by route for faster lookup
        const routeToStops = new Map<string, any[]>();
        gtfsData.trips.forEach(trip => {
            const rid = trip.route_id;
            if (!routeToStops.has(rid)) routeToStops.set(rid, []);
            // Get stops for this trip - in a real app we'd use stop_times
        });

        // Analysis Logic: Rank Grid Cells by Gap (Demand - Supply)
        setTimeout(() => {
            const results: OpportunityPoint[] = demandPoints.map(dp => {
                let supplyIntensity = 0;

                // Find stops within supplyRadius
                const nearbyStops = gtfsData.stops.filter(s => {
                    const dLat = (dp.lat - parseFloat(s.stop_lat));
                    const dLon = (dp.lon - parseFloat(s.stop_lon)) * Math.cos(dp.lat * Math.PI / 180);
                    const distKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111;
                    return distKm <= params.supplyRadius;
                });

                const seenRoutes = new Set<string>();

                nearbyStops.forEach(s => {
                    // Find routes serving this stop
                    // For demo/speed, we'll associate stops to the analysis results directly
                    // In a production GTFS app, this would be a multi-step join
                    const stopTrips = gtfsData.stopTimes
                        .filter(st => st.stop_id === s.stop_id)
                        .map(st => st.trip_id);

                    const stopRoutes = new Set(
                        gtfsData.trips
                            .filter(t => stopTrips.includes(t.trip_id))
                            .map(t => t.route_id)
                    );

                    stopRoutes.forEach(rid => {
                        if (seenRoutes.has(rid)) return;
                        seenRoutes.add(rid);

                        const analysis = analysisResults.find(ar => ar.route === rid && ar.day === 'Weekday');
                        if (analysis && analysis.avgHeadway > 0) {
                            // Service Intensity = buses per hour
                            const bph = (60 / analysis.avgHeadway);
                            supplyIntensity += bph;
                        }
                    });
                });

                // Normalize supply: 1.0 = ~10 min headway (6 bph) or multiple combined routes
                const normalizedSupply = Math.min(supplyIntensity / 12, 1.0);

                // Gap = Demand - Supply
                // We want to find where Demand is HIGH and Supply is LOW
                const gap = Math.max(0, dp.demand - (normalizedSupply * 0.8)); // 0.8 factor to keep some demand visible even near transit

                return {
                    lat: dp.lat,
                    lon: dp.lon,
                    population: dp.population,
                    jobs: dp.jobs,
                    demand: dp.demand,
                    supply: normalizedSupply,
                    gap,
                    opportunityScore: Math.round(gap * 100)
                };
            });

            setOpportunityPoints(results);
            setLoading(false);
        }, 1200);
    };

    return (
        <PredictContext.Provider value={{
            gtfsData,
            analysisResults,
            demandPoints,
            opportunityPoints,
            loading,
            params,
            setParams,
            runAnalysis
        }}>
            {children}
        </PredictContext.Provider>
    );
};

export const usePredict = () => {
    const context = useContext(PredictContext);
    if (!context) throw new Error('usePredict must be used within PredictProvider');
    return context;
};
