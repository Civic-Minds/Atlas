/**
 * The one "no data yet" sentence (CIV-1883, Ryan: "Refactor if needed"): "No data yet." on its own, or naming what has none:
 * "No data for this agency yet.", "No data for TTC yet." (Ryan's wording, 2026-11-19).
 */
export const noDataText = (forWhat?: string): string => `No data${forWhat ? ` for ${forWhat}` : ''} yet.`;
