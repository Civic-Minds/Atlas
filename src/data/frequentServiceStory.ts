export type StoryScale = 'large-system' | 'smaller-system' | 'counterexample';

export interface FrequentServiceStoryExample {
  id: string;
  city: string;
  agency: string;
  scale: StoryScale;
  headline: string;
  summary: string;
  details: string[];
  sourceLabel: string;
  sourceUrl: string;
  tone: 'orange' | 'blue' | 'green' | 'purple';
}

export const frequentServiceStoryStats = {
  agenciesReviewed: 500,
  namedNumericAgencies: 91,
  noDefinitionFound: 255,
  countries: 4,
  thresholdBars: [
    { minutes: 15, agencies: 69 },
    { minutes: 30, agencies: 20 },
    { minutes: 10, agencies: 13 },
    { minutes: 20, agencies: 13 },
    { minutes: 6, agencies: 7 },
    { minutes: 7, agencies: 7 },
    { minutes: 5, agencies: 6 },
    { minutes: 12, agencies: 6 },
    { minutes: 60, agencies: 4 },
  ],
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
    sourceLabel: 'TransLink Frequent Transit Network',
    sourceUrl: 'https://www.translink.ca/plans-and-projects/projects/frequent-transit-network',
    tone: 'blue',
  },
  {
    id: 'cta',
    city: 'Chicago',
    agency: 'Chicago Transit Authority',
    scale: 'large-system',
    headline: '10 minutes, with a weekend rule',
    summary: 'Chicago publishes a Frequent Network with different weekday and weekend spans.',
    details: ['6am–9pm weekdays', '9am–9pm weekends', 'Bus network'],
    sourceLabel: 'CTA Frequent Network',
    sourceUrl: 'https://lapi.transitchicago.com/frequent/',
    tone: 'purple',
  },
  {
    id: 'winnipeg',
    city: 'Winnipeg',
    agency: 'Winnipeg Transit',
    scale: 'large-system',
    headline: 'Frequent is a ladder, not a line',
    summary: 'Winnipeg publishes several service tiers, with different peak, off-peak, night, and weekend bands.',
    details: ['Frequent Lines: 10–15 minutes', 'Nights and weekends: 10–30 minutes', 'Connector and community tiers sit below it'],
    sourceLabel: 'Winnipeg network guide',
    sourceUrl: 'https://www.winnipeg.ca/services-programs/transportation-roads-parking/transit/understanding-network',
    tone: 'green',
  },
  {
    id: 'nanaimo',
    city: 'Nanaimo',
    agency: 'BC Transit',
    scale: 'smaller-system',
    headline: '15–30 minutes can still be “frequent”',
    summary: 'Nanaimo labels a Frequent Route while publishing a broader 15–30-minute service range.',
    details: ['Frequent Route product', '15–30-minute published range', 'Local routes: 30–60 minutes'],
    sourceLabel: 'Nanaimo network materials',
    sourceUrl: 'https://www.bctransit.com/nanaimo-introduces-transit-network-and-service-changes/',
    tone: 'blue',
  },
  {
    id: 'yellowknife',
    city: 'Yellowknife',
    agency: 'Yellowknife Transit',
    scale: 'smaller-system',
    headline: 'The context changes the number',
    summary: 'Yellowknife’s connector and neighbourhood services use a 30-minute starting point, with lower-demand periods extending to an hour.',
    details: ['30-minute connector at peak commuter times', '30–60-minute neighbourhood service', 'Bus routes'],
    sourceLabel: 'Yellowknife route information',
    sourceUrl: 'https://contacts.yellowknife.ca/en/living-here/new_routes.aspx',
    tone: 'orange',
  },
  {
    id: 'asheville',
    city: 'Asheville',
    agency: 'Asheville Rides Transit',
    scale: 'smaller-system',
    headline: 'Sometimes the definition is a plan',
    summary: 'Asheville’s draft network report proposes 15-minute service on selected corridors, while its older map uses a qualitative frequent-service label.',
    details: ['Selected corridors', 'Proposed network language', 'Older map has no numeric legend'],
    sourceLabel: 'Asheville network explanation',
    sourceUrl: 'https://www.ashevillenc.gov/news/the-asheville-rides-transit-art-draft-network-explained/',
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
    sourceLabel: 'Calgary system map',
    sourceUrl: 'https://www.calgarytransit.com/content/dam/transit/rider-information/System%20Map%20Dec%202025.pdf',
    tone: 'green',
  },
];
