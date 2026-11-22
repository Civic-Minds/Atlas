/**
 * #1693 (CIV-2121): agencies whose data terms don't allow Atlas to serve their data to other tools. Every Atlas Studio
 * MCP tool (local and hosted) leaves them out, and any data download Atlas adds must read this list too. The map and
 * History show their data inside Atlas and keep them. Why, with Ryan's words: docs/product/DECISIONS.md, 2026-11-22.
 * `reason` is shown on the Status page beside the agency's "Removed" tag.
 */
export interface RedistributionExclusion { slug: string; reason: string }

export const NO_REDISTRIBUTION: readonly RedistributionExclusion[] = [
  // WMATA's Transit Data Terms of Use bar "creating an application programming interface that enables access to Transit Data".
  { slug: 'wmata', reason: 'WMATA’s terms don’t allow an API that gives other tools access to its data.' },
];

/** The exclusion for an agency, or undefined when Atlas may serve its data to other tools. */
export const redistributionExclusion = (slug: string): RedistributionExclusion | undefined => NO_REDISTRIBUTION.find(x => x.slug === slug);
/** True when Atlas may serve an agency's data to other tools (the MCP, a download). */
export const mayRedistribute = (slug: string): boolean => !redistributionExclusion(slug);
