import type { AtlasStore, McpAgency, McpAgencyMeta, McpFeature, McpStop, IndexedAgency, McpHistoryAgency } from './mcpStore';
import type { StudioBeforeAfterFile } from './studioBeforeAfter';

/** An in-memory store (CIV-1840): tests, and anything that already holds the data. Same answers as the disk store from the same data. */
export interface MemoryData {
  catalog: McpAgency[];
  meta?: Record<string, McpAgencyMeta>;
  /** Each agency's route file features, as published (LineStrings and Points). */
  files: Record<string, Array<{ geometry: { type: string; coordinates?: [number, number] } | null; properties: Record<string, unknown> }>>;
  index?: IndexedAgency[] | null;
  history?: McpHistoryAgency[] | null;
  comparisons?: Record<string, StudioBeforeAfterFile>;
}

export function memoryStore(d: MemoryData): AtlasStore {
  return {
    async catalog() { return d.catalog.filter(a => !a.betaOnly); },
    async available() { return new Set(Object.keys(d.files)); },
    async meta() { return new Map(d.catalog.map(a => [a.slug, d.meta?.[a.slug] ?? { shortName: '', parentAgency: null }])); },
    async routeFeatures(slug) { return (d.files[slug]?.filter(f => f.geometry?.type === 'LineString') as McpFeature[] | undefined) ?? null; },
    async stops(slug) {
      const all = d.files[slug];
      return all ? all.filter(f => f.geometry?.type === 'Point').map((f): McpStop => ({ id: String(f.properties.stopId), name: String(f.properties.stopName ?? ''), lon: f.geometry!.coordinates![0], lat: f.geometry!.coordinates![1], routeIds: ((f.properties.routeIds as string[] | undefined) ?? []).map(String) })) : null;
    },
    async index() { return d.index ?? null; },
    async history() { return d.history ?? null; },
    async comparison(slug) { return d.comparisons?.[slug] ?? null; },
  };
}
