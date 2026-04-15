import { create } from 'zustand';
import { PopulationPoint, CoverageResult, CatalogRoute } from '../types/gtfs';
import { storage, STORES } from '../core/storage';
import { parsePopulationCsv, calculateCoverage } from '../core/population';

interface PopulationState {
    points: PopulationPoint[];
    coverage: CoverageResult | null;
    loading: boolean;
    error: string | null;

    loadPopulation: () => Promise<void>;
    uploadPopulationCsv: (file: File) => Promise<void>;
    computeCoverage: (routes: CatalogRoute[], bufferMeters?: number) => void;
    clearPopulation: () => Promise<void>;
}

export const usePopulationStore = create<PopulationState>((set, get) => ({
    points: [],
    coverage: null,
    loading: false,
    error: null,

    loadPopulation: async () => {
        set({ loading: true });
        try {
            const points = await storage.getItem<PopulationPoint[]>(STORES.POPULATION, 'default');
            set({ points: points || [], loading: false });
        } catch (err) {
            set({ error: 'Failed to load population data', loading: false });
        }
    },

    uploadPopulationCsv: async (file: File) => {
        set({ loading: true, error: null });
        try {
            const text = await file.text();
            const points = parsePopulationCsv(text);
            
            await storage.setItem(STORES.POPULATION, 'default', points);
            set({ points, loading: false });
        } catch (err: any) {
            set({ error: err.message || 'Failed to parse population CSV', loading: false });
        }
    },

    computeCoverage: (routes: CatalogRoute[], bufferMeters: number = 800) => {
        const { points } = get();
        if (points.length === 0) return;

        const result = calculateCoverage(points, routes, bufferMeters);
        set({ coverage: result });
    },

    clearPopulation: async () => {
        await storage.deleteItem(STORES.POPULATION, 'default');
        set({ points: [], coverage: null });
    }
}));
