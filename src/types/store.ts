import { create } from 'zustand';
import { GtfsData, AnalysisResult, SpacingResult } from './gtfs';
import { ValidationReport } from '../core/validation';
import { storage, STORES } from '../core/storage';

interface TransitState {
    gtfsData: GtfsData | null;
    analysisResults: AnalysisResult[];
    spacingResults: SpacingResult[];
    validationReport: ValidationReport | null;
    loading: boolean;

    // Actions
    setResults: (data: {
        gtfsData: GtfsData;
        analysisResults: AnalysisResult[];
        spacingResults: SpacingResult[];
        validationReport?: ValidationReport;
    }) => Promise<void>;
    loadPersistedData: () => Promise<void>;
    clearData: () => Promise<void>;
}

export const useTransitStore = create<TransitState>((set) => ({
    gtfsData: null,
    analysisResults: [],
    spacingResults: [],
    validationReport: null,
    loading: false,

    setResults: async (data) => {
        set({
            gtfsData: data.gtfsData,
            analysisResults: data.analysisResults,
            spacingResults: data.spacingResults,
            validationReport: data.validationReport || null,
            loading: false,
        });
        await storage.setItem(STORES.GTFS, 'latest', data.gtfsData);
        await storage.setItem(STORES.ANALYSIS, 'latest', data.analysisResults);
        await storage.setItem(STORES.SPACING, 'latest', data.spacingResults);
        if (data.validationReport) {
            await storage.setItem(STORES.PREFERENCES, 'validationReport', data.validationReport);
        }
    },

    loadPersistedData: async () => {
        set({ loading: true });
        try {
            const [gtfs, analysis, spacing, validation] = await Promise.all([
                storage.getItem<GtfsData>(STORES.GTFS, 'latest'),
                storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest'),
                storage.getItem<SpacingResult[]>(STORES.SPACING, 'latest'),
                storage.getItem<ValidationReport>(STORES.PREFERENCES, 'validationReport'),
            ]);

            if (gtfs && analysis) {
                set({
                    gtfsData: gtfs,
                    analysisResults: analysis,
                    spacingResults: spacing || [],
                    validationReport: validation || null,
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
        set({ gtfsData: null, analysisResults: [], spacingResults: [], validationReport: null });
        await Promise.all([
            storage.clearStore(STORES.GTFS),
            storage.clearStore(STORES.ANALYSIS),
            storage.clearStore(STORES.SPACING),
            storage.deleteItem(STORES.PREFERENCES, 'validationReport'),
        ]);
    }
}));
