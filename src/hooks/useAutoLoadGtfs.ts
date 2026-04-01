import { useEffect, useRef } from 'react';
import { useGtfsWorker } from './useGtfsWorker';
import { useTransitStore } from '../types/store';
import { useAuthStore } from './useAuthStore';

export function useAutoLoadGtfs() {
    const { gtfsData, setRawData, setLoading } = useTransitStore();
    const { runAnalysis } = useGtfsWorker();
    const { isAuthenticated, role, agencyId } = useAuthStore();
    const hasPreloaded = useRef(false);

    useEffect(() => {
        // If the user is authenticated, is NOT an admin, and has no GTFS data loaded yet
        if (isAuthenticated && role !== 'admin' && !gtfsData && !hasPreloaded.current) {
            hasPreloaded.current = true;
            
            // Set global loading state so UI components show a spinner instead of empty state
            setLoading(true);

            const loadNetworkDefault = async () => {
                try {
                    console.log(`Preloading custom agency data for user... Attempting ${agencyId || 'Portland'}`);
                    
                    // Try agency-specific data first, fallback to Portland
                    let url = `/data/samples/${agencyId}.zip`;
                    let response = await fetch(url);
                    
                    if (!response.ok) {
                        console.warn(`Agency data for ${agencyId} not found, falling back to Portland sample.`);
                        url = '/data/samples/Portland.zip';
                        response = await fetch(url);
                    }

                    if (!response.ok) {
                         throw new Error(`Failed to load data from ${url}`);
                    }

                    const blob = await response.blob();
                    const file = new File([blob], url.split('/').pop() || 'sample.zip', { type: 'application/zip' });
                    
                    runAnalysis(file, async (data) => {
                        await setRawData(data);
                        setLoading(false);
                    });
                } catch (e) {
                    console.error("Failed to preload network data:", e);
                    setLoading(false);
                }
            };
            
            loadNetworkDefault();
        }
    }, [isAuthenticated, role, agencyId, gtfsData, runAnalysis, setRawData, setLoading]);
}
