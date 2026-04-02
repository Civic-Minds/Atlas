import { useEffect, useRef } from 'react';
import { useGtfsWorker } from './useGtfsWorker';
import { useTransitStore } from '../types/store';
import { useAuthStore } from './useAuthStore';
import { useViewAs } from './useViewAs';
import { screenRoutes } from '../services/atlasApi';
import type { GtfsData, AnalysisResult } from '../types/gtfs';

const DAY_TYPES = ['Weekday', 'Saturday', 'Sunday'] as const;

function tierFromHeadway(avg: number): string {
    if (avg <= 5) return '5';
    if (avg <= 8) return '8';
    if (avg <= 10) return '10';
    if (avg <= 15) return '15';
    if (avg <= 20) return '20';
    if (avg <= 30) return '30';
    return '60';
}

export function useAutoLoadGtfs() {
    const { gtfsData, setRawData, setResults, setLoading } = useTransitStore();
    const { runAnalysis } = useGtfsWorker();
    const { isAuthenticated, role, agencyId } = useAuthStore();
    const { viewAsAgency } = useViewAs();
    const lastViewAs = useRef<string | null>(null);
    const hasPreloaded = useRef(false);

    // Admin: load OCI data for the selected agency
    useEffect(() => {
        if (!isAuthenticated || role !== 'admin') return;

        if (!viewAsAgency) {
            lastViewAs.current = null;
            return;
        }

        if (lastViewAs.current === viewAsAgency.slug) return;
        lastViewAs.current = viewAsAgency.slug;
        setLoading(true);

        const load = async () => {
            try {
                const results = await Promise.all(
                    DAY_TYPES.map(day =>
                        screenRoutes({
                            agency: viewAsAgency.slug,
                            maxHeadway: 120,
                            windowStart: 360,
                            windowEnd: 1320,
                            dayType: day,
                            directions: 'one',
                        }).then(res => ({ day, routes: res.routes }))
                          .catch(() => ({ day, routes: [] }))
                    )
                );

                const analysisResults: AnalysisResult[] = results.flatMap(({ day, routes }) =>
                    routes.map(r => ({
                        route: r.route_short_name || r.gtfs_route_id,
                        day,
                        dir: '0',
                        avgHeadway: parseFloat(r.avg_headway) || 0,
                        medianHeadway: parseFloat(r.avg_headway) || 0,
                        tier: r.tier ?? tierFromHeadway(parseFloat(r.avg_headway) || 60),
                        tripCount: r.trip_count,
                        gaps: [],
                        times: [],
                        reliabilityScore: parseFloat(r.reliability_score ?? '0') || 0,
                        consistencyScore: 0,
                        bunchingPenalty: 0,
                        outlierPenalty: 0,
                        headwayVariance: 0,
                        bunchingFactor: 0,
                        peakHeadway: r.peak_headway ? parseFloat(r.peak_headway) : undefined,
                        baseHeadway: parseFloat(r.base_headway) || undefined,
                        serviceSpan: { start: r.service_span_start, end: r.service_span_end },
                        routeType: r.mode_category ?? undefined,
                        routeLongName: r.route_long_name ?? undefined,
                    }))
                );

                const uniqueRouteIds = [...new Set(analysisResults.map(r => r.route))];
                const weekdayRoutes = results.find(r => r.day === 'Weekday')?.routes ?? [];
                const gtfsStub: GtfsData = {
                    agencies: [{ agency_id: viewAsAgency.slug, agency_name: viewAsAgency.display_name, agency_url: '', agency_timezone: '' }],
                    routes: uniqueRouteIds.map(id => {
                        const match = weekdayRoutes.find(r => (r.route_short_name || r.gtfs_route_id) === id);
                        return {
                            route_id: id,
                            route_short_name: id,
                            route_long_name: match?.route_long_name ?? '',
                            route_type: '3',
                            agency_id: viewAsAgency.slug,
                        };
                    }),
                    trips: [],
                    stops: [],
                    stopTimes: [],
                    calendar: [],
                    calendarDates: [],
                    shapes: [],
                };

                setResults({ gtfsData: gtfsStub, analysisResults, spacingResults: [] });
            } catch (e) {
                console.error('Failed to load agency data:', e);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [viewAsAgency, isAuthenticated, role]);

    // Regular users: auto-load agency sample
    useEffect(() => {
        if (isAuthenticated && role !== 'admin' && !gtfsData && !hasPreloaded.current) {
            hasPreloaded.current = true;
            setLoading(true);

            const loadNetworkDefault = async () => {
                try {
                    let url = `/data/samples/${agencyId}.zip`;
                    let response = await fetch(url);

                    if (!response.ok) {
                        url = '/data/samples/Portland.zip';
                        response = await fetch(url);
                    }

                    if (!response.ok) throw new Error(`Failed to load data from ${url}`);

                    const blob = await response.blob();
                    const file = new File([blob], url.split('/').pop() || 'sample.zip', { type: 'application/zip' });

                    runAnalysis(file, async (data) => {
                        await setRawData(data);
                        setLoading(false);
                    });
                } catch (e) {
                    console.error('Failed to preload network data:', e);
                    setLoading(false);
                }
            };

            loadNetworkDefault();
        }
    }, [isAuthenticated, role, agencyId, gtfsData, runAnalysis, setRawData, setLoading]);
}
