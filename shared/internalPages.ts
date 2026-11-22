import { HEADER_TAG_INTERNAL } from './siteMode';
import { ANALYTICS_PATH, INTERNAL_PATH, LIVE_PATH, MCP_DOCS_PATH, STUDIO_COVERAGE_PATH, STUDIO_PATH } from './rules/paths';
import { MCP_DOCS } from './mcpDocsCopy';
import { ANALYTICS_COPY } from './analytics';
import { PAGE_NAMES } from './pageNames';

/**
 * The local-only pages (CIV-1872): the /internal home page lists each once, in groups, and the content-page header's
 * internal links take the first few. The wording is new UI text (Ryan signs it off word for word), so it all lives here.
 * Every address is the page's own, read from where it is defined.
 */

export interface InternalPage {
  title: string;
  description: string;
  path: string;
}

export interface InternalGroup {
  heading: string;
  pages: readonly InternalPage[];
}

export const INTERNAL_HOME_TITLE = HEADER_TAG_INTERNAL;

/** The two diagnostics pages' addresses (main.tsx registers them on the dev server only). */
export const DIAGNOSTICS_UNEVEN_PATH = '/dev/diagnostics/uneven-headway';
export const DIAGNOSTICS_PERFORMANCE_PATH = '/dev/diagnostics/performance';

export const INTERNAL_GROUPS: readonly InternalGroup[] = [
  {
    heading: 'Tools',
    pages: [
      { title: 'Studio', description: 'Schedules and buses needed, for one agency at a time.', path: STUDIO_PATH },
      { title: PAGE_NAMES.studioCoverage, description: 'What each agency has: map, History, Live, Studio and the MCP’s figures.', path: STUDIO_COVERAGE_PATH },
      { title: MCP_DOCS.title, description: MCP_DOCS.card, path: MCP_DOCS_PATH },
      { title: ANALYTICS_COPY.title, description: ANALYTICS_COPY.card, path: ANALYTICS_PATH },
    ],
  },
  {
    heading: 'Diagnostics',
    pages: [
      { title: 'Uneven headways', description: 'Directions with a gap much longer than their usual spacing.', path: DIAGNOSTICS_UNEVEN_PATH },
      { title: 'Load measurements', description: 'How long this page took to load, and what it asked for.', path: DIAGNOSTICS_PERFORMANCE_PATH },
    ],
  },
];

/** The header's internal links (dev only): the main internal products, then More, which opens the home page. */
export const INTERNAL_HEADER_LINKS: readonly { label: string; path: string; /** Drawn with the arrow "Go to Atlas" has (Ryan: "more should have an arrow beside it"). */ arrow?: true }[] = [
  { label: 'Studio', path: STUDIO_PATH },
  { label: 'Live', path: LIVE_PATH },
  { label: MCP_DOCS.title, path: MCP_DOCS_PATH },
  { label: PAGE_NAMES.studioCoverage, path: STUDIO_COVERAGE_PATH },
  { label: 'More', path: INTERNAL_PATH, arrow: true },
];
