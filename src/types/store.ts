import { create } from 'zustand';
import { GtfsData, AnalysisResult, SpacingResult, RawRouteDepartures, AnalysisCriteria } from './gtfs';
import { ValidationReport } from '../core/validation';
import { storage, STORES } from '../core/storage';
import { applyAnalysisCriteria } from '../core/transit-logic';
import { DEFAULT_CRITERIA } from '../core/defaults';

interface TransitState {
    gtfsData: GtfsData | null;
    analysisResults: AnalysisResult[];
    spacingResults: SpacingResult[];
    validationReport: ValidationReport | null;
    loading: boolean;

    // New: raw departure data and criteria
    rawDepartures: RawRouteDepartures[];
    activeCriteria: AnalysisCriteria;

    // Actions
    setResults: (data: {
        gtfsData: GtfsData;
        analysisResults: AnalysisResult[];
        spacingResults: SpacingResult[];
        validationReport?: ValidationReport;
    }) => Promise<void>;

    setRawData: (data: {
        gtfsData: GtfsData;
        rawDepartures: RawRouteDepartures[];
        spacingResults: SpacingResult[];
        validationReport?: ValidationReport;
    }) => Promise<void>;

    setCriteria: (criteria: AnalysisCriteria) => Promise<void>;
    reapplyCriteria: () => void;

    loadPersistedData: () => Promise<void>;
    clearData: () => Promise<void>;
}

export const useTransitStore = create<TransitState>((set, get) => ({
    gtfsData: null,
    analysisResults: [],
    spacingResults: [],
    validationReport: null,
    loading: false,
    rawDepartures: [],
    activeCriteria: DEFAULT_CRITERIA,

    // Legacy action — still works for backward compat
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

    // New: store raw departures and auto-apply criteria
    setRawData: async (data) => {
        const criteria = get().activeCriteria;
        const analysisResults = applyAnalysisCriteria(data.rawDepartures, criteria);

        set({
            gtfsData: data.gtfsData,
            rawDepartures: data.rawDepartures,
            analysisResults,
            spacingResults: data.spacingResults,
            validationReport: data.validationReport || null,
            loading: false,
        });

        await Promise.all([
            storage.setItem(STORES.GTFS, 'latest', data.gtfsData),
            storage.setItem(STORES.RAW_DEPARTURES, 'latest', data.rawDepartures),
            storage.setItem(STORES.ANALYSIS, 'latest', analysisResults),
            storage.setItem(STORES.SPACING, 'latest', data.spacingResults),
            data.validationReport
                ? storage.setItem(STORES.PREFERENCES, 'validationReport', data.validationReport)
                : Promise.resolve(),
        ]);
    },

    // Update criteria and re-run analysis instantly
    setCriteria: async (criteria) => {
        const { rawDepartures } = get();
        const analysisResults = rawDepartures.length > 0
            ? applyAnalysisCriteria(rawDepartures, criteria)
            : [];

        set({ activeCriteria: criteria, analysisResults });

        await Promise.all([
            storage.setItem(STORES.CRITERIA, 'active', criteria),
            storage.setItem(STORES.ANALYSIS, 'latest', analysisResults),
        ]);
    },

    // Re-apply current criteria to current raw data (synchronous)
    reapplyCriteria: () => {
        const { rawDepartures, activeCriteria } = get();
        if (rawDepartures.length === 0) return;
        const analysisResults = applyAnalysisCriteria(rawDepartures, activeCriteria);
        set({ analysisResults });
    },

    loadPersistedData: async () => {
        set({ loading: true });
        try {
            const [gtfs, rawDeps, analysis, spacing, validation, criteria] = await Promise.all([
                storage.getItem<GtfsData>(STORES.GTFS, 'latest'),
                storage.getItem<RawRouteDepartures[]>(STORES.RAW_DEPARTURES, 'latest'),
                storage.getItem<AnalysisResult[]>(STORES.ANALYSIS, 'latest'),
                storage.getItem<SpacingResult[]>(STORES.SPACING, 'latest'),
                storage.getItem<ValidationReport>(STORES.PREFERENCES, 'validationReport'),
                storage.getItem<AnalysisCriteria>(STORES.CRITERIA, 'active'),
            ]);

            if (gtfs && analysis) {
                set({
                    gtfsData: gtfs,
                    rawDepartures: rawDeps || [],
                    analysisResults: analysis,
                    spacingResults: spacing || [],
                    validationReport: validation || null,
                    activeCriteria: criteria || DEFAULT_CRITERIA,
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
        set({
            gtfsData: null,
            rawDepartures: [],
            analysisResults: [],
            spacingResults: [],
            validationReport: null,
            activeCriteria: DEFAULT_CRITERIA,
        });
        await Promise.all([
            storage.clearStore(STORES.GTFS),
            storage.clearStore(STORES.RAW_DEPARTURES),
            storage.clearStore(STORES.ANALYSIS),
            storage.clearStore(STORES.SPACING),
            storage.clearStore(STORES.CRITERIA),
            storage.deleteItem(STORES.PREFERENCES, 'validationReport'),
        ]);
    }
}));
