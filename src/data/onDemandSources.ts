/**
 * On-demand services kept as source JSON in config/on-demand/<slug>.json (CIV-50), one file per
 * service, read by the R2 export alongside the older TypeScript registry. Node-only.
 *
 * {
 *   "slug": "lawrence-ku",                 // the Atlas agency slug the service attaches to
 *   "agency": { ... },                     // only for an on-demand-only agency with no catalog entry
 *   "area": {                              // everything the card shows; same fields as the app's onDemandServiceArea
 *     "serviceName", "sourceUrl", "sourceLabel", "sourceRetrievedAt",
 *     "serviceHours"?, "availability"?, "hoursNote"?, "eligibility"?, "bookingInfo"?, "bookingUrl"?,
 *     "pickup"?, "tripRules"?, "zoneMetadata"?
 *   },
 *   "features": [ ...GeoJSON Polygon/MultiPolygon zones, each with properties.areaName ],
 *   "stopFeatures"?: [ ...GeoJSON Point stops or destination points ],
 *   "notes"?: "anything for the next person, e.g. a re-check reason"
 * }
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OnDemandArea } from './onDemandRegistry';

export const ON_DEMAND_SOURCE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../config/on-demand');

export interface OnDemandSource {
  slug: string;
  agency?: Record<string, unknown> & { slug: string; name: string };
  area: Omit<OnDemandArea, 'features' | 'stopFeatures'>;
  features: OnDemandArea['features'];
  stopFeatures?: OnDemandArea['stopFeatures'];
  notes?: string;
}

/** Structural problems with one source file; empty when it can be published. */
export function sourceProblems(source: OnDemandSource, fileName?: string): string[] {
  const problems: string[] = [];
  const where = fileName ?? source.slug;
  if (!source.slug || !/^[a-z0-9-]+$/.test(source.slug)) problems.push(`${where}: slug missing or not lower-case-hyphenated`);
  if (fileName && fileName !== `${source.slug}.json`) problems.push(`${where}: file name must be ${source.slug}.json`);
  for (const field of ['serviceName', 'sourceUrl', 'sourceLabel', 'sourceRetrievedAt'] as const) {
    if (!source.area?.[field]) problems.push(`${where}: area.${field} is required`);
  }
  if (source.area?.sourceRetrievedAt && !/^\d{4}-\d{2}-\d{2}$/.test(source.area.sourceRetrievedAt)) problems.push(`${where}: sourceRetrievedAt must be YYYY-MM-DD`);
  if (!Array.isArray(source.features)) problems.push(`${where}: features must be an array`);
  if ((source.features?.length ?? 0) === 0 && !(source.stopFeatures?.length)) problems.push(`${where}: no zones or stops`);
  const zoneNames = new Set<string>();
  for (const f of source.features ?? []) {
    if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') problems.push(`${where}: zone geometry must be Polygon or MultiPolygon`);
    const name = (f.properties as { areaName?: string } | null)?.areaName;
    if (name) zoneNames.add(name);
  }
  for (const name of Object.keys(source.area?.zoneMetadata ?? {})) {
    if (!zoneNames.has(name)) problems.push(`${where}: zoneMetadata "${name}" matches no zone's areaName`);
  }
  if (source.agency && source.agency.slug !== source.slug) problems.push(`${where}: agency.slug must equal slug`);
  return problems;
}

/** Every source file, in slug order. Throws on any structural problem. */
export function loadOnDemandSources(dir = ON_DEMAND_SOURCE_DIR): OnDemandSource[] {
  if (!fs.existsSync(dir)) return [];
  const sources: OnDemandSource[] = [];
  const problems: string[] = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const source = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as OnDemandSource;
    problems.push(...sourceProblems(source, file));
    sources.push(source);
  }
  if (problems.length > 0) throw new Error(`On-demand source problems:\n${problems.join('\n')}`);
  return sources;
}
