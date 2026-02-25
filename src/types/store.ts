import { create } from 'zustand';
import { GtfsData, AnalysisResult, SpacingResult } from './gtfs';
import { storage, STORES } from '../core/storage';

interface TransitState {
    gtfsData: GtfsData | null;
    analysisResults: AnalysisResult[];
    spacingResults: SpacingResult[];
    loading: boolean;

    // Actions
    setResults: (data: { gtfsData: GtfsData, analysisResults: AnalysisResult[], spacingResults: SpacingResult[] }) => Promise<void>;
    loadPersistedData: () => Promise<void>;
    clearData: () => Promise<void>;
}

export const useTransitStore = create<TransitState>((set) => ({
    gtfsData: null,
    analysisResults: [],
    spacingResults: [],
    loading: false,

    setResults: async (data) => {
        set({ ...data, loading: false });
        await storage.setItem(STORES.GTFS, 'latest', data.gtfsData);
        await storage.setItem(STORES.ANALYSIS, 'latest', data.analysisResults);
        await storage.setItem('spacing_diagnostic', 'latest', data.spacingResults);
    },

    loadPersistedData: async () => {
        set({ loading: true });
        try {
            const [gtfs, analysis, spacing] = await Promise.all([
                storage.getItem<GtfsData>(STORES.GTFS, 'latest'),
                storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest'),
                storage.getItem<SpacingResult[]>('spacing_diagnostic', 'latest')
            ]);

            if (gtfs && analysis) {
                set({
                    gtfsData: gtfs,
                    analysisResults: analysis,
                    spacingResults: spacing || [],
                    loading: false
                });
            } else {
                set({ loading: false });
            }
        } catch (error) {
            console.error('Failed to load persisted transit data:', error);
            set({ loading: false });
        }
    },

    clearData: async () => {
        set({ gtfsData: null, analysisResults: [], spacingResults: [] });
        await Promise.all([
            storage.clearStore(STORES.GTFS),
            storage.clearStore(STORES.ANALYSIS),
            storage.deleteItem('spacing_diagnostic', 'latest')
        ]);
    }
}));
