/**
 * The focus list in one place (CIV-1866, from CIV-1865 and docs/product/STRATEGY.md "Focus cities and agencies"): the
 * places Live, History, Studio, the vehicles-needed figures and the MCP's pilot go deep in first. Imports only the
 * archive shard list (no app code), so the app, the scripts, the Worker and the tests all read it. Add an agency here,
 * not in a copy elsewhere; which agencies are recorded comes from the shards (CIV-1899).
 */

import { RECORDING_SLUGS } from '../liveArchiveFeeds.js';

export interface FocusArea {
  slug: string;
  name: string;
  /** Agency data slugs (config/agencies/<slug>.json), in the order the strategy page lists them. */
  agencies: readonly string[];
}

export const FOCUS_AREAS: readonly FocusArea[] = [
  { slug: 'greater-golden-horseshoe', name: 'Greater Golden Horseshoe', agencies: ['ttc', 'hamilton', 'burlington', 'brampton', 'miway', 'godurham', 'yrt', 'grt', 'go'] },
  { slug: 'kingston', name: 'Kingston', agencies: ['kingston'] },
  { slug: 'denver', name: 'Denver', agencies: ['rtd-denver'] },
  { slug: 'guelph', name: 'A small Ontario city (Guelph)', agencies: ['guelph'] },
  { slug: 'boston', name: 'Boston', agencies: ['mbta'] },
];

/** Every focus agency, in the areas' order. */
export const FOCUS_AGENCY_SLUGS: readonly string[] = FOCUS_AREAS.flatMap(a => a.agencies);

const FOCUS_SET: ReadonlySet<string> = new Set(FOCUS_AGENCY_SLUGS);
export const isFocusAgency = (slug: string): boolean => FOCUS_SET.has(slug);

/** The agency Studio opens on when the address names none: the demo agency. */
export const STUDIO_DEFAULT_AGENCY = 'kingston';

/**
 * Where each deeper product should go next (the strategy page's "Per product" table). A product may hold an agency only
 * from here, or when an agency or consultant asks for it; the main map and History have no such limit.
 */
export const PRODUCT_FOCUS = {
  /** Recorded every minute (TTC, Hamilton and the MBTA Green Line, plus Kingston for Studio only): the archive shards marked `recording`. */
  live: RECORDING_SLUGS,
  /** Agencies with a Schedule Changes file. */
  studio: ['kingston', 'hamilton', 'rtd-denver', 'guelph'],
  /** Agencies with a buses-needed file. Local and regional bus only. */
  vehiclesNeeded: ['kingston', 'hamilton', 'rtd-denver', 'guelph'],
} as const satisfies Record<string, readonly string[]>;

