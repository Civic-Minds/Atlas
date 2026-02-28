import { create } from 'zustand';
import { GtfsData, AnalysisResult } from './gtfs';
import { FeedMeta, CatalogRoute, VerificationStatus } from './catalog';
import { storage, STORES } from '../core/storage';
import { buildCatalogRoutes, detectChanges, deriveCurrentRoutes, extractFeedMeta } from '../core/catalog';

interface CatalogState {
    feeds: FeedMeta[];
    catalogRoutes: CatalogRoute[];       // all versions (full history)
    currentRoutes: CatalogRoute[];       // derived: latest per routeKey
    loading: boolean;

    loadCatalog: () => Promise<void>;
    commitFeed: (
        gtfsData: GtfsData,
        analysisResults: AnalysisResult[],
        agencyName: string,
        fileName: string,
    ) => Promise<{ added: number; updated: number; unchanged: number }>;
    updateVerification: (routeId: string, status: VerificationStatus, notes?: string) => Promise<void>;
    removeFeed: (feedId: string) => Promise<void>;
    getRouteHistory: (routeKey: string) => CatalogRoute[];
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
    feeds: [],
    catalogRoutes: [],
    currentRoutes: [],
    loading: false,

    loadCatalog: async () => {
        set({ loading: true });
        try {
            const [feeds, catalogRoutes] = await Promise.all([
                storage.getAllItems<FeedMeta>(STORES.FEEDS),
                storage.getAllItems<CatalogRoute>(STORES.CATALOG),
            ]);
            const currentRoutes = deriveCurrentRoutes(catalogRoutes);
            set({ feeds, catalogRoutes, currentRoutes, loading: false });
        } catch (error) {
            console.error('Failed to load catalog:', error);
            set({ loading: false });
        }
    },

    commitFeed: async (gtfsData, analysisResults, agencyName, fileName) => {
        const feedMetaBase = extractFeedMeta(gtfsData, fileName);
        // Override agency name if user provided one
        feedMetaBase.agencyName = agencyName;
        feedMetaBase.agencyId = agencyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        // Build catalog routes from analysis results
        const incoming = buildCatalogRoutes(gtfsData, analysisResults, feedMetaBase);

        // Detect changes against existing catalog
        const { catalogRoutes: existing } = get();
        const changes = detectChanges(existing, incoming);

        // All incoming routes (with inherited verification where applicable)
        const allIncoming = [...changes.added, ...changes.updated, ...changes.unchanged];

        // Save feed metadata
        const feedMeta: FeedMeta = {
            ...feedMetaBase,
            committedRouteCount: allIncoming.length,
        };
        await storage.setItem(STORES.FEEDS, feedMeta.feedId, feedMeta);

        // Save all catalog routes (batch write)
        await storage.putItems(STORES.CATALOG, allIncoming.map(r => ({ key: r.id, value: r })));

        // Update state
        const newCatalogRoutes = [...existing, ...allIncoming];
        const currentRoutes = deriveCurrentRoutes(newCatalogRoutes);
        set({
            feeds: [...get().feeds, feedMeta],
            catalogRoutes: newCatalogRoutes,
            currentRoutes,
        });

        return {
            added: changes.added.length,
            updated: changes.updated.length,
            unchanged: changes.unchanged.length,
        };
    },

    updateVerification: async (routeId, status, notes) => {
        const { catalogRoutes } = get();
        const route = catalogRoutes.find(r => r.id === routeId);
        if (!route) return;

        const updated: CatalogRoute = {
            ...route,
            verificationStatus: status,
            verifiedAt: Date.now(),
            verificationNotes: notes,
        };

        await storage.setItem(STORES.CATALOG, updated.id, updated);

        const newCatalogRoutes = catalogRoutes.map(r => r.id === routeId ? updated : r);
        set({
            catalogRoutes: newCatalogRoutes,
            currentRoutes: deriveCurrentRoutes(newCatalogRoutes),
        });
    },

    removeFeed: async (feedId) => {
        const { feeds, catalogRoutes } = get();

        // Remove all catalog routes for this feed
        const routesToRemove = catalogRoutes.filter(r => r.feedId === feedId);
        for (const route of routesToRemove) {
            await storage.deleteItem(STORES.CATALOG, route.id);
        }
        await storage.deleteItem(STORES.FEEDS, feedId);

        const newFeeds = feeds.filter(f => f.feedId !== feedId);
        const newCatalogRoutes = catalogRoutes.filter(r => r.feedId !== feedId);
        set({
            feeds: newFeeds,
            catalogRoutes: newCatalogRoutes,
            currentRoutes: deriveCurrentRoutes(newCatalogRoutes),
        });
    },

    getRouteHistory: (routeKey) => {
        return get().catalogRoutes
            .filter(r => r.routeKey === routeKey)
            .sort((a, b) => a.committedAt - b.committedAt);
    },
}));
