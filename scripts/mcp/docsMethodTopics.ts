/**
 * CIV-3197: the explain_method topics, each one or more Docs page sections (their ids in src/pages/AboutDocsPage.tsx).
 * The text itself is generated from the page (buildDocsMethods.tsx), never typed here.
 */
export const DOCS_METHOD_TOPICS = [
  { key: 'frequency', about: 'how a route\'s frequency is worked out: the typical wait, weekdays, directions and branches, the shared stretch, tiers and near misses', sections: ['frequency'] },
  { key: 'service', about: 'regular, part-time and occasional service, and "Irregular"', sections: ['service-classification'] },
  { key: 'figures', about: 'why figures can differ across the map, route lists, route cards, stops and the shared stretch', sections: ['map-architecture'] },
  { key: 'quality', about: 'data quality: corrections, outdated schedules and how they are flagged', sections: ['quality'] },
  { key: 'glossary', about: 'the glossary: headway, frequency tier, route rating, service periods, branch, shared stretch and more', sections: ['glossary'] },
  { key: 'live', about: 'Live\'s measures: trip time, extra wait, bunching, delivered trips, lateness', sections: [] },
] as const;

export type DocsMethodTopic = (typeof DOCS_METHOD_TOPICS)[number]['key'];
