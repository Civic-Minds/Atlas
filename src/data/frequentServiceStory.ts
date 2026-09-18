export type StoryScale = 'large-system' | 'smaller-system' | 'counterexample';

import audit from '../../docs/research/system-map-audit-2026-09.json';

export interface FrequentServiceStoryExample {
  id: string;
  city: string;
  agency: string;
  scale: StoryScale;
  headline: string;
  summary: string;
  details: string[];
  thresholdMinutes: number[];
  sourceLabel: string;
  sourceUrl: string;
  tone: 'orange' | 'blue' | 'green' | 'purple';
}

const storyThresholds = [10, 15];
const records = audit.records;
const categoryCounts = {
  numericDefinition: records.filter(record => ['numeric_definition_on_map', 'numeric_definition_on_official_page'].includes(record.status)).length,
  qualitativeDefinition: records.filter(record => ['qualitative_definition_on_map', 'qualitative_definition_on_official_page'].includes(record.status)).length,
  noDefinitionFound: records.filter(record => ['no_definition_on_map', 'no_definition_on_official_page'].includes(record.status)).length,
  mapUnavailable: records.filter(record => record.status === 'map_unavailable').length,
};
const representativeNumericRecords = records.filter(record => Number.isInteger(record.representativeThresholdMinutes));

export const frequentServiceStoryStats = {
  agenciesReviewed: records.length,
  reviewedAt: 'September 18, 2026',
  countryCounts: Object.entries(records.reduce<Record<string, number>>((counts, record) => {
    counts[record.country] = (counts[record.country] ?? 0) + 1;
    return counts;
  }, {})).map(([country, agencies]) => ({ country, agencies })),
  categoryCounts,
  namedNumericAgencies: representativeNumericRecords.length,
  noDefinitionFound: categoryCounts.noDefinitionFound,
  countries: new Set(records.map(record => record.country)).size,
  headwayBars: storyThresholds.map(minutes => ({
    minutes,
    agencies: representativeNumericRecords.filter(record => record.representativeThresholdMinutes === minutes).length,
  })),
};

export const frequentServiceStoryExamples: FrequentServiceStoryExample[] = [
  {
    id: 'ttc',
    city: 'Toronto',
    agency: 'Toronto Transit Commission',
    scale: 'large-system',
    headline: 'A 10-minute network',
    summary: 'Toronto names a 10-Minute Network directly on its system map.',
    details: ['6am–1am Monday–Saturday', 'Sunday starts later', 'Bus and rail network'],
    thresholdMinutes: [10],
    sourceLabel: 'TTC system map',
    sourceUrl: 'https://cdn.ttc.ca/-/media/Project/TTC/DevProto/Images/Home/Routes-and-Schedules/Landing-page-pdfs/TTC_SystemMap.pdf?rev=88203dbcf60c47738cf9acc980c45cad',
    tone: 'orange',
  },
  {
    id: 'translink-vancouver',
    city: 'Vancouver',
    agency: 'TransLink Vancouver',
    scale: 'large-system',
    headline: '15 minutes on the corridor',
    summary: 'Vancouver defines a Frequent Transit Network around corridors, not just individual routes.',
    details: ['6am weekdays', '7am Saturday; 8am Sunday', 'Bus and SkyTrain can combine'],
    thresholdMinutes: [15],
    sourceLabel: 'TransLink Frequent Transit Network',
    sourceUrl: 'https://maps.translink.ca/-/media/translink/documents/schedules-and-maps/transit-system-maps/system-maps/frequent_transit_network_of_metro_vancouver_map.pdf',
    tone: 'blue',
  },
  {
    id: 'cta',
    city: 'Chicago',
    agency: 'Chicago Transit Authority',
    scale: 'large-system',
    headline: 'A frequent-route symbol',
    summary: 'Chicago’s system-map legend marks CTA frequent routes without publishing a numeric threshold on the map.',
    details: ['System-map legend', 'Qualitative label', 'Bus network'],
    thresholdMinutes: [],
    sourceLabel: 'CTA system map',
    sourceUrl: 'https://www.transitchicago.com/assets/1/6/ctamap_SystemMap.pdf',
    tone: 'purple',
  },
  {
    id: 'uta',
    city: 'Salt Lake City',
    agency: 'Utah Transit Authority',
    scale: 'large-system',
    headline: 'A frequent tier with a slower rail period',
    summary: 'UTA labels bus and rail products frequent, but the published periods vary by product and time of day.',
    details: ['15 minutes bus; 30–60 minutes rail', 'FrontRunner reaches 60 minutes off-peak', 'Bus and rail products'],
    thresholdMinutes: [15],
    sourceLabel: 'UTA official map pages',
    sourceUrl: 'https://www.rideuta.com/-/media/Files/Current-Projects/Five-Year-Service-Plan/UTA_Five_Year_Service_Plan2023_FINAL.pdf',
    tone: 'purple',
  },
  {
    id: 'calgary',
    city: 'Calgary',
    agency: 'Calgary Transit',
    scale: 'counterexample',
    headline: 'No named definition found',
    summary: 'Calgary has frequent routes in practice, but the reviewed official materials did not publish one named rider-facing threshold.',
    details: ['System map reviewed', 'Service guidelines reviewed', 'No definition does not mean no frequent service'],
    thresholdMinutes: [],
    sourceLabel: 'Calgary system map',
    sourceUrl: 'https://www.calgarytransit.com/content/dam/transit/rider-information/System%20Map%20Dec%202025.pdf',
    tone: 'green',
  },
];
