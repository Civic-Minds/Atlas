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
  // CIV-2124, group A: the terms don't allow sharing the data with other tools (_reports/civ-462/agencies-v2.tsv has each clause).
  { slug: 'des-moines', reason: 'DART’s data terms don’t allow sharing its data with other tools.' },
  { slug: 'nyc-ferry', reason: 'NYC Ferry’s data terms don’t allow sharing its data with other tools.' },
  { slug: 'beeline', reason: 'Westchester County’s Bee-Line data terms don’t allow sharing its data with other tools.' },
  // CIV-2124, group C: the terms need the agency's consent; out until it gives it in writing.
  { slug: 'norta', reason: 'New Orleans RTA’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'cata-lansing', reason: 'CATA’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'spokane', reason: 'Spokane Transit’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'trimet', reason: 'TriMet’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'vre', reason: 'VRE’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'rtcwashoe', reason: 'RTC Washoe’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'mta-flint', reason: 'Flint MTA’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'max-transit', reason: 'MAX Transit’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'citybus-lafayette', reason: 'CityBus’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'topeka', reason: 'Topeka Metro’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'cherriots', reason: 'Cherriots’ data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
  { slug: 'ctran', reason: 'C-TRAN’s data terms don’t allow sharing its data with other tools without its consent, so it’s left out until the agency gives written permission.' },
];

/** The exclusion for an agency, or undefined when Atlas may serve its data to other tools. */
export const redistributionExclusion = (slug: string): RedistributionExclusion | undefined => NO_REDISTRIBUTION.find(x => x.slug === slug);
/** True when Atlas may serve an agency's data to other tools (the MCP, a download). */
export const mayRedistribute = (slug: string): boolean => !redistributionExclusion(slug);
