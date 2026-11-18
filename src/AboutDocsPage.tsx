import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { FEATURES, PERIOD_LABELS, PUBLIC_TIER_MAXES, TIME_PERIODS } from '../shared/config';
import { headwayAmount, headwayEvery, headwayEveryRange } from '../shared/headwayText';
import { EDGE_GAP_ALLOWANCE_MINUTES, GRACE_FLOOR_MIN_GAPS, GRACE_MINUTES, GRACE_PERCENT, nearMissGrace, RAIL_TIER_WINDOW, TIER_MAXES, VIOLATION_PERCENT, VIOLATION_PERCENT_BY_TIER } from '../shared/frequencyRules';
import { countText, percentText } from '../shared/numberText';
import { MIN_HISTORY_DISTINCT_YEARS } from '../shared/historyEligibility';
import { metresText } from '../shared/unitText';
import { hourRange, timeRange } from '../shared/timeText';
import { joinList, plural } from '../shared/overflowText';
import { RESEARCH } from './data/research';
import ScrollX from './components/ui/ScrollX';
import SiteContact from './components/SiteContact';
import DocsPageLayout from './components/ui/DocsPageLayout';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { PageTitle, SectionTitle, SubsectionTitle } from './components/ui/PageTitle';
import {
  BETA_ROLLOUT_NOTICE,
  BOOKING_REQUIRED_NOTICE,
  CORRECTED_DATA_NOTICE,
  DOCS_PAGE_TITLE,
  EXPLAINERS,
  HIDE_ONE_OFF_SETTING,
  HIDE_PART_TIME_SETTING,
  IRREGULAR_PERIOD_LABEL,
  IRREGULAR_PERIOD_SHORT_LABEL,
  LOCATION_DENIED,
  NEW_SCHEDULE_DATA_NOTICE,
  NO_ROUTE_SHAPE_NOTICE,
  REPORT_A_PROBLEM,
  ROUTE_DATA_QUALITY_WARNING_MESSAGE,
  SHARED_STRETCH_LABEL,
  WEEKDAY_VARIATION_NOTICE,
  expiredFeedNotice,
  loadErrorText,
  periodServiceNotice,
  selectedRouteOutsideFilterNotice,
  selectedRoutePartMeetsFilterNotice,
  unevenServiceNotice,
} from './content/noticeCopy';

/** Each period's hours ("6–9 AM"), from TIME_PERIODS so the page can't drift from the app (CIV-1610). */
const PERIOD_TIMES = Object.fromEntries(TIME_PERIODS.map(p => [p.key, hourRange(p.startHour, p.endHour)])) as Record<(typeof TIME_PERIODS)[number]['key'], string>;
/** The frequency tiers as the page lists them: "≤10, ≤15, ≤20, ≤30 and ≤60 min" (the tier breakpoints, CIV-1610; the page needs no colours). */
const TIER_LIST = `${joinList(PUBLIC_TIER_MAXES.map(max => `≤${max}`))} min`;
/** The agency table's period columns, in AgencyPage.tsx's order. */
const AGENCY_TABLE_PERIODS = joinList([PERIOD_LABELS.amPeak, PERIOD_LABELS.midday, PERIOD_LABELS.pmPeak, PERIOD_LABELS.evening, PERIOD_LABELS.overnight]);
/** The research pages, counted and named from RESEARCH so the page can't drift from the /research index (CIV-1610, CIV-1440). */
const RESEARCH_VIEWS = `${countText(RESEARCH.length)} focused ${plural(RESEARCH.length, 'view')}, ${joinList(RESEARCH.map(entry => entry.title.toLowerCase()))}`;
/** How a route is rated (FREQUENCY_RULES rules 2-4, D1): the Frequency section and the glossary's "Route rating" both read this (CIV-1440). */
const ROUTE_RATING = 'A route’s line colour and filter result come from its slowest direction. Within each direction, the part its regular trips all share and each branch are checked on their own, and the slowest one counts.';

const LiveGlossaryTerms = lazy(() => import('./components/LiveGlossaryTerms'));

const DOCS_CONTENTS = [
  ['overview', 'Overview'],
  ['what-atlas-does', 'Capabilities'],
  ['data-model', 'Model'],
  ['data-products', 'Products'],
  ['data-flow', 'Pipeline'],
  ['frequency', 'Frequency'],
  ['service-classification', 'Service'],
  ['map-architecture', 'Mapping'],
  ['corrections', 'Corrections'],
  ['pipeline-changes', 'Change Process'],
  ['quality', 'Quality'],
  ['validation', 'Validation'],
  ['notices', 'Notices'],
  ['glossary', 'Glossary'],
] as const;
type DocsSectionId = (typeof DOCS_CONTENTS)[number][0];
/** A section's heading is its "On this page" label, so the two can't differ (CIV-1610). */
const DOCS_SECTION_LABELS = Object.fromEntries(DOCS_CONTENTS) as Record<DocsSectionId, string>;

function Section({ id, children }: { id: DocsSectionId; children: ReactNode }) {
  const title = DOCS_SECTION_LABELS[id];
  return (
    <section id={id} className="scroll-mt-24">
      <SectionTitle className="mb-2">{title}</SectionTitle>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--text-dim)]">{children}</div>
    </section>
  );
}

/** A filter's own description inside a sentence, first letter lowered. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <SubsectionTitle>{title}</SubsectionTitle>
      {children}
    </div>
  );
}

/**
 * The Notices section (CIV-1236, Ryan's approved groups): each group's examples are the app's own notices, read from
 * noticeCopy.ts, with [brackets] where the app fills in a name, date or number.
 */
// onDemand: shown only where on-demand is on (FEATURES.onDemand).
const NOTICE_GROUPS: { title: string; text: string; examples: string[]; onDemand?: true }[] = [
  {
    title: 'Old and new schedules',
    text: "The agency’s schedule has ended, is new and still being checked, or had an error we corrected.",
    examples: [expiredFeedNotice('[Agency]', '[date]'), NEW_SCHEDULE_DATA_NOTICE.route],
  },
  {
    title: "Errors in the agency’s data",
    text: "A route’s line is missing or wrong in the agency’s data. Its frequency still comes from the schedule.",
    examples: [NO_ROUTE_SHAPE_NOTICE, ROUTE_DATA_QUALITY_WARNING_MESSAGE],
  },
  {
    title: 'When a route runs',
    text: "The route doesn’t run, or runs for only part of the time, on the day or at the time of day you picked.",
    examples: [periodServiceNotice(PERIOD_TIMES.amPeak, false), periodServiceNotice(PERIOD_TIMES.amPeak, true, '7–9 AM')],
  },
  {
    title: 'Uneven schedules',
    text: "The wait between trips isn’t the same everywhere: it changes by weekday, through the day or at the first or last trip.",
    examples: [WEEKDAY_VARIATION_NOTICE, unevenServiceNotice(999).replace('999', '[N]')],
  },
  {
    title: 'Filters',
    text: "The route, or part of it, doesn’t meet the frequency filter you picked, or is hidden by your filters.",
    examples: [selectedRouteOutsideFilterNotice(15, PERIOD_TIMES.amPeak), selectedRoutePartMeetsFilterNotice(15, PERIOD_TIMES.pmPeak)],
  },
  {
    title: 'Beta and on-demand service',
    text: 'Agencies still being tested on Atlas beta, and service riders book ahead or that runs by request in a zone.',
    examples: [BETA_ROLLOUT_NOTICE, BOOKING_REQUIRED_NOTICE],
    onDemand: true,
  },
  {
    title: 'Loading, errors and empty lists',
    text: "Something didn’t load, a search found nothing or your browser blocked location or copying. Most clear up when you try again.",
    examples: [loadErrorText('this route'), LOCATION_DENIED],
  },
];

/** The near-miss table, from the pipeline's own settings (shared/rules/frequency.ts, CIV-1612). */
const NEAR_MISS_ROWS: [string, string, string][] = PUBLIC_TIER_MAXES.map(tier => [
  headwayAmount(tier),
  headwayAmount(tier + nearMissGrace(tier)),
  `${percentText(VIOLATION_PERCENT_BY_TIER[tier] ?? VIOLATION_PERCENT)} of gaps`,
]);
const NEAR_MISS_COLUMNS: DataTableColumn<[string, string, string]>[] = [
  { key: 'band', header: 'Target band', cell: row => row[0] },
  { key: 'limit', header: 'Near-miss limit', cell: row => row[1] },
  { key: 'allowance', header: 'Allowance', cell: row => row[2] },
];

export default function AboutDocsPage() {
  // A link into a section (such as the Live pages' "What these terms mean") lands on it: the sections render after the browser's own jump.
  useEffect(() => { const id = window.location.hash.slice(1); if (id) document.getElementById(id)?.scrollIntoView(); }, []);
  const showLive = FEATURES.live;
  const showHistory = FEATURES.history;
  const showResearch = FEATURES.researchApps;
  // The checks list skips step 5 (on-demand) where on-demand is off, so later steps renumber.
  const flexStep = FEATURES.onDemand ? 1 : 0;

  return (
    <DocsPageLayout contents={{ title: DOCS_PAGE_TITLE, items: DOCS_CONTENTS.map(([id, label]) => ({ id, label })) }}>
          <header>
            <div className="flex flex-wrap items-center gap-3">
              <PageTitle>{DOCS_PAGE_TITLE}</PageTitle>
            </div>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-dim)]">
              A technical overview of how Atlas turns published transit data into analysed, verified and mapped service information.
            </p>
          </header>

          <Section id="overview">
            <SubsectionTitle>What Atlas Is</SubsectionTitle>
            <p>Atlas is a transit analysis platform with a client-side application for comparing scheduled service across agencies and cities.</p>
            <p>It turns published transit schedules into map layers, route summaries, stop-level frequency estimates and network comparisons.</p>
            <SubsectionTitle>Design Principles</SubsectionTitle>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Shared data:</strong> every Atlas tool works from the same route, stop and freshness data. History and real-time data show up only where those features are turned on.</li>
              <li><strong className="text-[var(--text-primary)]">Honest numbers:</strong> when a period does not have enough consistent service to give a real frequency, Atlas says so instead of adjusting the calculation until it shows a believable number.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">Kept history:</strong> each past schedule is kept as a dated snapshot. A period that is missing or unusable stays empty. Atlas never copies or guesses it from another period.</li>}
              <li><strong className="text-[var(--text-primary)]">Stable data:</strong> new information is added alongside existing fields, never in place of them, so anything built on published data keeps its meaning.</li>
            </ul>
          </Section>

          <Section id="what-atlas-does">
            <p>Atlas is more than a map renderer. It is a shared transit-data platform with several layers of work:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Explore:</strong> search agencies, routes, stops and nearby service across a large catalogue.</li>
              <li><strong className="text-[var(--text-primary)]">Frequency:</strong> compare service by day type, time period, route branch, direction and stop.</li>
              <li><strong className="text-[var(--text-primary)]">Compare:</strong> two maps side by side, each with its own frequency, day and time (desktop and tablet).</li>
              <li><strong className="text-[var(--text-primary)]">On phones:</strong> a Filters button in the header holds frequency, day, time and modes.</li>
              <li><strong className="text-[var(--text-primary)]">Export:</strong> save the map as an image with a poster layout and a source line.</li>
              <li><strong className="text-[var(--text-primary)]">Hourly chart:</strong> each hour shows the slower direction{FEATURES.runningTimes ? '; the full-day view also shows how long the trip takes by hour' : ''}.</li>
              <li><strong className="text-[var(--text-primary)]">Data quality:</strong> expose source dates, stale schedules, review states, corrections, geometry repairs and known limitations.</li>
              {FEATURES.onDemand && <li><strong className="text-[var(--text-primary)]">On-demand:</strong> represent on-demand and GTFS-Flex service as zones or virtual stops where a fixed route is the wrong model.</li>}
              {showResearch && <li><strong className="text-[var(--text-primary)]">Research:</strong> an overnight-service view and a frequent-service story, which sit under Research.</li>}
            </ul>
            <p>Some surfaces are public, some are in beta and some remain research or validation tools. The same processed data model supports all of them without making every experimental feature part of the main map.</p>
            {showLive && <p>Live is a separate GTFS-Realtime path: it polls configured agency feeds for vehicle positions, trip updates and selected observed headways. Coverage is route-specific, may be partial and is never treated as proof that the scheduled frequency calculation is current.</p>}
          </Section>

          <Section id="data-model">
            <p>Atlas keeps several kinds of transit information separate because they answer different questions:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Schedule data</strong> describes what an agency publishes for planned service.</li>
              <li><strong className="text-[var(--text-primary)]">Processed metrics</strong> describe what Atlas derives from that schedule, such as headways, tiers, coverage and route branches.</li>
              <li><strong className="text-[var(--text-primary)]">Sources and quality</strong> describe where a result comes from, how current it is, whether it is under review, and any corrections made to it.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">Historical data</strong> describes documented past schedule periods rather than pretending current data is historical.</li>}
              {showLive && <li><strong className="text-[var(--text-primary)]">Real-time data</strong> describes observed vehicle or adherence information and is never silently mixed with schedule frequency.</li>}
            </ul>
            <p>This separation is one of Atlas’s core design principles: a useful number is not automatically a trustworthy number unless its source, meaning and time period are clear.</p>
          </Section>

          <Section id="data-products">
            <p>Different transit questions need different products. Atlas keeps these surfaces related but does not force them into one overloaded route card:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Frequency:</strong> current scheduled cadence, period filters, route variants, stop-level metrics and map colouring.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">History:</strong> selected agencies with usable archived GTFS periods, showing documented service changes without fabricating missing years.</li>}
              <li><strong className="text-[var(--text-primary)]">Agency and area pages:</strong> each agency has a page with a bar showing how many of its routes fall in each weekday-midday frequency band, a route table by mode with {AGENCY_TABLE_PERIODS} waits, and nearby agencies. The first sentence names the agencies it connects with, meaning agencies with a stop within {metresText(150)} of one of its stops, and counts its stops as unique places (stops with the same name within {metresText(150)} count once). Area pages do the same for every agency in an area, such as the Greater Toronto and Hamilton Area.</li>
              {FEATURES.onDemand && <li><strong className="text-[var(--text-primary)]">On-demand service:</strong> GTFS-Flex and source-backed service areas represented separately from fixed-route frequency so booking-based service is not misread as a normal route.</li>}
              {showResearch && <li><strong className="text-[var(--text-primary)]">Research:</strong> {RESEARCH_VIEWS}, built on source-reviewed data before anything becomes a general map feature.</li>}
            </ul>
            {showHistory && <p>The History eligibility rule requires at least {MIN_HISTORY_DISTINCT_YEARS} distinct snapshot years. Historical route identity is matched by exact route short name by default, with explicit aliases for documented redesigns.</p>}
            {showResearch && <p>Research outputs can become product features only after their definitions, coverage and source quality are clear. This is why Atlas sometimes contains a capability in the data or code before exposing it in the primary navigation.</p>}
          </Section>

          <Section id="data-flow">
            <p>Atlas primarily ingests General Transit Feed Specification (GTFS) schedule data published by transit agencies and transit data providers. An official agency feed is preferred; a provider-hosted mirror or fallback may be used when the primary source is unavailable.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Every feed that can be checked automatically is checked weekly. A feed whose schedule ends within the next week is also checked daily, until a newer schedule appears. A few agencies don’t publish a feed Atlas can check automatically; Atlas updates those when a newer file is provided and verified.</li>
              <li>The pipeline identifies the schedule periods that are active around the refresh date.</li>
              <li>Routes, stops, calendars, trips, stop times and shapes are normalized into a shared model.</li>
              <li>Frequency metrics and quality signals are calculated from the normalized schedule.</li>
              <li>Static route data, stop indexes and vector tiles are published to object storage.</li>
              <li>The browser loads only the data needed for the current map view and selected agency.</li>
            </ol>
            <p>Atlas does not require an account or a user database.</p>
            <Subsection title="GTFS Inputs">
              <p>Atlas consumes GTFS Schedule as a relational set of core tables, calendar rules, optional geometry and optional extensions. It joins those records into a normalized analysis model before producing map and service metrics:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><code className="text-xs text-[var(--text-primary)]">routes.txt</code> identifies services and their public route names;</li>
                <li><code className="text-xs text-[var(--text-primary)]">trips.txt</code> identifies individual scheduled runs and, when supplied, their directions;</li>
                <li><code className="text-xs text-[var(--text-primary)]">stop_times.txt</code> supplies the scheduled arrivals and departures;</li>
                <li><code className="text-xs text-[var(--text-primary)]">stops.txt</code> supplies names and coordinates; and</li>
                <li><code className="text-xs text-[var(--text-primary)]">calendar.txt</code>, <code className="text-xs text-[var(--text-primary)]">calendar_dates.txt</code>, and feed dates determine when trips operate.</li>
              </ul>
              <p>Shapes and route metadata describe where a service runs, but the frequency numbers come from scheduled departures. A visually long route is not automatically a frequent route.</p>
              <p>Atlas also reads <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, <code className="text-xs text-[var(--text-primary)]">shapes.txt</code>, and GTFS-Flex extensions where present. A feed without <code className="text-xs text-[var(--text-primary)]">shapes.txt</code> can still contain usable schedule data, so Atlas falls back to stop-to-stop straight-line geometry and records a validation warning. Missing route identifiers, trips that point to a missing route, invalid coordinates or no usable route output are more serious and can prevent publication.</p>
              <p>GTFS-Flex adds inputs including <code className="text-xs text-[var(--text-primary)]">locations.geojson</code>, <code className="text-xs text-[var(--text-primary)]">location_groups.txt</code>, <code className="text-xs text-[var(--text-primary)]">location_group_stops.txt</code>, and <code className="text-xs text-[var(--text-primary)]">booking_rules.txt</code>. Atlas validates those separately rather than forcing them through fixed-route assumptions.</p>
            </Subsection>
            <Subsection title="Schedule Selection">
              <p>Feeds commonly contain past, current and future service at the same time. Atlas evaluates the feed’s calendar dates around the refresh date and selects the schedule period that is active for the map.</p>
              <p>It then separates departures by day type—weekday, Saturday, and Sunday—and by named time period. This prevents an expired schedule or a future seasonal schedule from being treated as today’s service. For some agencies, trains that run only on a few special dates, such as game-day trains, are left out of the typical day.</p>
              <p>After publication, the agency’s source date and freshness state remain visible in Atlas.</p>
            </Subsection>
            <Subsection title="Routes, Branches and Shapes">
              <p>A public route name can represent several patterns: branches, short turns, directions, destinations or trips that only operate during part of the day. Atlas keeps those patterns distinct long enough to calculate meaningful service, then presents them through route and branch summaries.</p>
              <p>For map display, Atlas selects representative geometry for the active service patterns. For analysis, it avoids allowing a short branch or clearly excluded trip pattern to distort the frequency of the main route.</p>
              <p>This is why the line shown on the map, the cadence shown on a route card, and the cadence used by a frequency filter can be related but not identical measurements.</p>
            </Subsection>
          </Section>

          <Section id="frequency">
            <p>Atlas calculates scheduled headways: the time between consecutive departures. It reads departure times from <code className="text-xs text-[var(--text-primary)]">stop_times.txt</code> and expands valid frequency-based trips from <code className="text-xs text-[var(--text-primary)]">frequencies.txt</code>; it does not treat that optional table as a single route-level answer.</p>
            <p>Departures are grouped by route, direction, day and service period. {ROUTE_RATING} Stop-level cadence is calculated separately. For a group of departures, Atlas sorts the consecutive gaps and uses the median gap as the typical wait. On route cards, when a rider arriving at a random time would wait at least 10 min longer than the median, the card shows that wait instead. It is read at midday, or else the PM peak, or else across the day, and only where the route runs through that time. The frequency filter and map colours still use the median.</p>
            <p>One odd gap does not change the median, so one unusually long gap does not make otherwise regular service {headwayEvery(10)} look like service {headwayEvery(30)}. The exception is service where short and long gaps alternate (for example gaps of 60, 120, 60 min): the median would show only the short gap and halve the real wait, so Atlas reads the longer wait instead.</p>
            <p>Period calculations are kept inside their own time windows. Atlas does not silently borrow an average from across the day to fill a period with sparse or missing service.</p>
            <p>Atlas keeps separate projections for display cadence, filter cadence, branch cadence, shared-stretch cadence and stop-specific cadence. A stop or shared stretch can have a different value from the whole route because it may combine branches or cover only part of the route.</p>
            <p>Period output also carries separate longest-gap and sustained-service signals. These diagnostics can mark a median as unrepresentative without changing the stored median or silently filling the gap with a value from across the day.</p>
            <Subsection title="Weekday Schedules">
              <p>Atlas evaluates Monday through Friday separately. It does not combine departures from different weekdays into one synthetic schedule, because that can create service that never actually ran on any single day.</p>
              <p>The frequency tier is the slowest tier among the weekdays the route runs as a regular schedule; a day that only holds the tail of the previous night, or a short burst of a few trips, does not set it. The displayed cadence uses the actual weekday whose trip count is closest to the median weekday trip count, so it represents a real day without letting an unusually busy or unusually quiet day dominate the summary.</p>
              <p>A route that runs on only one or two weekdays is shown as limited on weekdays instead of borrowing a frequency from those days. Weekday stop and time-of-day numbers all describe the same typical weekday.</p>
            </Subsection>
            <Subsection title="Directions, Branches and Route Qualification">
              <p>Atlas calculates each scheduled direction separately before deciding whether a route qualifies. It uses the feed’s <code className="text-xs text-[var(--text-primary)]">direction_id</code> when present. If that field is missing, trips fall into the default direction group, Atlas records a warning and the resulting headway may be understated because opposite directions may have been merged.</p>
              <p>Within a direction, Atlas also separates different headsigns and physical shapes so branches and short turns do not get mixed into one artificially frequent series. One exception: when two patterns take turns running trips to the same end of the line, and neither runs consistently on its own but together they do, Atlas reads them as one service on the stops they share. Surface routes keep the longest meaningful shape groups for analysis, with a trip-volume fallback when length alone would discard most of the service; rail-like routes use their longest available shape. These are analysis choices, not claims that the feed’s direction labels are always correct.</p>
              <p>The frequency filter and the map colours are direction-aware. For a period threshold, every direction must meet the threshold, and the worst direction decides, so a route does not pass solely because one direction is frequent while the other is materially slower. A rush-hour-only route with consistent trips is rated by its own spacing, so it can pass the filter during its rush hour. Occasional extra trips, such as a short turn or an extension with only a few runs, are set aside when the same direction has a consistent main pattern, and a direction is never dropped from the check. For example, a direction {headwayEvery(10)} paired with one {headwayEvery(30)} does not pass ≤10 min; it can pass ≤30 min if the other route-level checks also pass. The separate “All” service view is broader by design: it can show service in only one direction or service that has not qualified for a numeric tier. A route/day with a direction that has no sustained, real-tier pattern can also be marked occasional as a whole and hidden by the default occasional-service filter.</p>
            </Subsection>
            <SubsectionTitle>Band Qualification and Tolerance</SubsectionTitle>
            <p>This band test decides whether a pattern counts as consistent service, as opposed to infrequent or occasional service. Atlas tests the tightest band first and requires enough departures to cover the analysed span at that band. For a target of <code className="text-xs text-[var(--text-primary)]">T</code> minutes, the minimum trip count is based on <code className="text-xs text-[var(--text-primary)]">ceil(span ÷ T)</code>.</p>
            <p>A gap at or below <code className="text-xs text-[var(--text-primary)]">T</code> passes directly. A slightly longer internal gap can count as a near miss when it is no more than <code className="text-xs text-[var(--text-primary)]">T + max({headwayAmount(GRACE_MINUTES)}, {percentText(GRACE_PERCENT)} of T)</code>. The number of allowed near misses is tier-specific and capped at three:</p>
            <ScrollX>
              <DataTable
                variant="compact"
                columns={NEAR_MISS_COLUMNS}
                rows={NEAR_MISS_ROWS}
                rowKey={row => row[0]}
              />
            </ScrollX>
            <p>Atlas rounds the percentage down, but allows at least one near miss once there are {GRACE_FLOOR_MIN_GAPS} or more gaps, and never more than three. A first or last gap that is genuinely at the edge of service may receive a separate allowance up to <code className="text-xs text-[var(--text-primary)]">T + {headwayAmount(EDGE_GAP_ALLOWANCE_MINUTES)}</code>. That edge allowance also uses one of the same near-miss slots, and at least four departures must remain after the edge treatment is applied. A gap beyond the relevant limit, or too many near misses, disqualifies the band and Atlas tests the next slower one.</p>
            <p>These allowances handle ordinary schedule rounding and small deviations without turning a genuinely uneven route into a frequent one. A large gap is still a failure even if the median looks good, and the final tier is the fastest band that survives the full check. Every mode, bus, rail and streetcar alike, is graded on the same {joinList(TIER_MAXES.map(String))} min bands; the 5 and 8 min bands count as 10 and are not separate options in the main map filter. Rail is tested on midday service from {timeRange(RAIL_TIER_WINDOW.start, RAIL_TIER_WINDOW.end)}.</p>
            <Subsection title="Frequency Bands">
              <p>The main Frequency control currently exposes service at {TIER_LIST}. The filter and the line colour use the route’s worst-direction cadence, so a route whose slowest direction runs less often than {headwayEvery(60)} appears as infrequent. Occasional service is hidden by default.</p>
            </Subsection>
            <Subsection title="Sustained Service and Long Gaps">
              <p>A median alone can hide an important gap. For example, departures might be {headwayEvery(30)} during a period except for one 180 min gap. Atlas keeps additional coverage and longest-gap signals so a route can be marked as uneven instead of presenting the median as the whole story.</p>
              <p>Frequency tiers therefore require sustained service across the relevant window. A route does not qualify for a fast tier simply because it has a short burst of frequent trips at one edge of the period.</p>
              <p>When a route operates only during part of the day, Atlas records that absence as an empty period rather than copying its operating-period value into the rest of the day.</p>
            </Subsection>
          </Section>

          <Section id="service-classification">
            <p>Frequency and regularity are separate properties. A route can run {headwayEvery(30)} and still be occasional if it only operates for a short burst or has too few repeated departures to establish a sustained pattern.</p>
            <dl className="space-y-2">
              <div><dt className="font-bold text-[var(--text-primary)]">Regular</dt><dd>Service covers the normal analysis window. It may be frequent or infrequent.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Part-time</dt><dd>{HIDE_PART_TIME_SETTING.description}</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Occasional</dt><dd>{HIDE_ONE_OFF_SETTING.description}</dd></div>
            </dl>
            <p>Two filters, both on by default, decide which of these routes the map shows. {HIDE_ONE_OFF_SETTING.label} hides occasional service: {lowerFirst(HIDE_ONE_OFF_SETTING.description)} {HIDE_PART_TIME_SETTING.label} hides part-time service: {lowerFirst(HIDE_PART_TIME_SETTING.description)} A part-time route you choose to show is still judged by the frequency filter, on the selected period’s frequency. Periods outside its operation remain empty rather than inheriting a value from across the day.</p>
            <p>Routes with only a few trips in a period read “{IRREGULAR_PERIOD_SHORT_LABEL}” instead of a frequency, and route cards name each pattern, such as “Rush hour only”. Each filter links to a list of the routes it hides.</p>
          </Section>

          <Section id="map-architecture">
            <p>The map is a React application using MapLibre for map interaction and rendering. Route geometry is distributed in vector tiles for broad map views, while agency detail and stop indexes are loaded as smaller JSON files when needed.</p>
            <p>At a high level, the browser combines three kinds of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>agency metadata, coverage, source dates and quality notices;</li>
              <li>route geometry and serialized frequency properties; and</li>
              <li>stop coordinates and route-specific service metrics.</li>
            </ul>
            <p>This separation keeps the initial map responsive and lets Atlas update schedule data independently from the application interface.</p>
            <Subsection title="Why Values Can Differ Across the Interface">
              <p>Atlas exposes several legitimate views of service:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-[var(--text-primary)]">Display cadence</strong> describes the route or destination a person is looking at.</li>
                <li><strong className="text-[var(--text-primary)]">Filter cadence</strong> is the worst direction’s cadence. It decides whether a route qualifies for a selected frequency threshold and sets the line colour and the dot colour in the route chooser. Route lists, agency and area pages, Compare and search show the filter’s value, so a number in a list always passes the filter at that number. Where a route doesn’t pass the filter’s check in a period, they show “Irregular” instead of a number.</li>
                <li><strong className="text-[var(--text-primary)]">Stop cadence</strong> describes service at a specific boarding stop.</li>
                <li><strong className="text-[var(--text-primary)]">Shared-stretch cadence</strong> describes the combined service where branches overlap.</li>
              </ul>
              <p>These projections answer different questions. Stop and shared-stretch values are for display only: a busy stretch never makes a route qualify on its own. When a route already qualifies, the map can highlight the stretch where stop-level service meets the threshold. Atlas labels the surfaces rather than pretending there is one universal number.</p>
            </Subsection>
            <Subsection title="Public Outputs">
              <p>After processing, Atlas publishes a set of read-only files for the map:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>route geometry with serialized service metrics;</li>
                <li>a lightweight stop index for searching and stop-specific views;</li>
                <li>trip and stop-metadata files published for downstream tools;</li>
                {showResearch && <li>research indexes where those views are enabled;</li>}
                <li>vector tiles for efficient map rendering; and</li>
              <li>agency metadata describing coverage, freshness, sources and quality status.</li>
              </ul>
              <p>These files contain processed public transit information. They do not contain user accounts, private analytics records, feed credentials or the raw maintainer workflow.</p>
            </Subsection>
          </Section>

          <Section id="corrections">
            <p>Atlas does not treat every source feed as ready for publication. Corrections happen at different layers, and the layer matters:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Parsing repairs</strong> address malformed source structures, such as broken or interleaved route geometry, only when the repair is unambiguous and validated.</li>
              <li><strong className="text-[var(--text-primary)]">Normalization rules</strong> reconcile feed conventions, synthesize usable directions, remove duplicate patterns (so a bus described twice in the feed is counted once), and separate branches or short turns that would otherwise distort analysis.</li>
              <li><strong className="text-[var(--text-primary)]">User-facing corrections</strong> remove known non-revenue trips, placeholder destinations, duplicate source service or other values that do not represent the published service.</li>
              <li><strong className="text-[var(--text-primary)]">Agency-specific overrides</strong> handle a documented feed problem that cannot safely become a global rule. These are scoped to the affected agency, route, shape or source snapshot.</li>
              <li><strong className="text-[var(--text-primary)]">Quality annotations</strong> preserve problems that should not be silently “fixed,” such as missing shapes, stale feeds, route-frequency mismatches or unresolved geometry.</li>
            </ul>
            <p>Atlas does not overwrite the upstream GTFS ZIP. It parses the source into an internal data model, applies validated transforms there and publishes its own processed output. Those transforms can filter unusable routes or trips, merge equivalent branches, synthesize missing direction metadata, normalize agency-specific conventions or repair clearly identifiable geometry problems.</p>
            <p>Geometry repairs are conservative: when the parser cannot establish an unambiguous repair, it keeps the original geometry and records the anomaly for review rather than inventing a replacement. The source snapshot remains distinguishable from Atlas’s processed output.</p>
            <p>Every correction should have a reason, a narrow scope and a validation check. A general rule is only preferred when it has been tested against unrelated agencies; otherwise Atlas uses a targeted exception rather than risking a larger silent change.</p>
            <p>Corrections are tied to the source data that required them. When a new upstream feed arrives, Atlas rechecks whether the correction is still needed instead of treating the old exception as permanent truth.</p>
            <p>Where a correction affects interpretation, Atlas can show a public note on the relevant agency or route. The goal is not to make imperfect data look perfect; it is to make the processing decision visible and bounded.</p>
          </Section>

          <Section id="pipeline-changes">
            <p>Every fix is tested against other agencies before it goes in. New data is compared with what’s live before it publishes.</p>
            <p>When a source feed changes, Atlas rechecks the correction against the new source. A past exception is not treated as permanent truth, and a newer file is not promoted merely because its date is newer if it fails processing or validation.</p>
          </Section>

          <Section id="quality">
            <p>Atlas checks feeds for structural and service-data problems, including missing or unusual geometry, schedule inconsistencies, stale sources and route-frequency anomalies. Some known source problems are corrected or annotated before publication.</p>
            <p>Feed-specific corrections are kept separate from the general methodology so a fix for one agency does not silently change every agency’s results.</p>
            <SubsectionTitle>A Conservative Publication Rule</SubsectionTitle>
            <p>Atlas would rather show no result and clearly indicate that data is missing than show a precise-looking result that may be wrong. This applies to route geometry, frequency metrics, service areas and research findings.</p>
            <p>When the evidence is incomplete, Atlas can leave a route or field out, mark a result as unavailable or provisional, keep a feed in review, or keep the last good published data with a freshness warning. It does not fill gaps with a guessed value merely to make the map look complete.</p>
            <SubsectionTitle>How Atlas Communicates Data Quality</SubsectionTitle>
            <p>Quality decisions are not meant to disappear behind a clean-looking map. Atlas surfaces user-relevant changes in the interface:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">{EXPLAINERS['corrected-data'].title}:</strong> agency and route cards can say “{CORRECTED_DATA_NOTICE.route}” with an explanation of the known feed problem and technical issue links when available.</li>
              <li><strong className="text-[var(--text-primary)]">Outdated schedules:</strong> route cards say “{expiredFeedNotice('[Agency]', '[date]')}”</li>
              <li><strong className="text-[var(--text-primary)]">{EXPLAINERS['new-schedule-data'].title}:</strong> for agencies whose past feeds have repeatedly had problems, a newly published feed is marked “{NEW_SCHEDULE_DATA_NOTICE.route}” until Atlas checks it for missing service and quality problems.</li>
              {FEATURES.feedQuality && <li><strong className="text-[var(--text-primary)]">Feed quality:</strong> beta quality controls distinguish Healthy, Review, Degraded and Unusable feeds. The reasons can include errors reading the feed, validation warnings, adjusted shapes, route-versus-stop frequency differences, expired schedules or no usable route output.</li>}
              <li><strong className="text-[var(--text-primary)]">Route-level warnings:</strong> a route can carry a separate warning when its displayed geometry needed adjustment or its service data needs interpretation.</li>
            </ul>
            <p>Not every internal exclusion becomes a separate banner. Clearly unusable rows can be removed during processing without overwhelming the map with implementation details, while known user-facing corrections, stale schedules, review states and material quality problems remain labelled where they affect interpretation.</p>
            <SubsectionTitle>How Outdated Data Is Flagged</SubsectionTitle>
            <p>Atlas determines schedule freshness from the service dates inside the feed, not only from the date the file was downloaded. It compares the latest usable date in <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, <code className="text-xs text-[var(--text-primary)]">calendar.txt</code>, and non-removal entries in <code className="text-xs text-[var(--text-primary)]">calendar_dates.txt</code> with the current date, and an agency with several feeds uses the earliest of its feeds’ dates. A schedule also counts as ended when the calendars that carry most of its service have ended, even if a few rows run on.</p>
            <p>During each refresh, Atlas records the feed’s expiry or version. If every available feed has expired, a download fails or validation fails, Atlas marks the agency as stale and retains the last good published data instead of replacing it with broken or empty output.</p>
            <p>This also applies when a source publishes a newer GTFS file that is malformed or fails Atlas’s processing checks: the newer file is not promoted simply because it is newer. The active feed identity and last successful refresh remain unchanged; Atlas records the reason for the failure and tries again at the next refresh. If a source’s file is empty or unreadable, Atlas tries the agency’s next source for that feed.</p>
            <p>The interface then identifies that schedule as potentially outdated and shows the known end date and the check history when available. For agencies whose past feeds have repeatedly had problems, a newer feed is marked as under review while it is checked for missing service and other quality problems. A feed can therefore be visible, stale, under review, degraded or unusable as separate states rather than being silently treated as current.</p>
            <p>Source feeds can be delayed, incomplete, discontinued or incorrect.</p>
          </Section>

          <Section id="validation">
            <p>Validation is the internal evidence chain behind those user-visible states. Atlas does not treat a feed as trustworthy merely because it parsed successfully: valid GTFS can still produce a misleading map, an implausible frequency or a service area that should not be treated like a fixed route.</p>
            <SubsectionTitle>How Broadly Changes Are Tested</SubsectionTitle>
            <p>When Atlas changes a shared calculation, the candidate rule is compared across the full set of eligible route-period observations in the local data. This is broader than checking one example route: the same route may be evaluated multiple times because its directions, weekdays, branches or time periods are separate observations with different schedules.</p>
            <p>Changes that survive that broad comparison are then run through the processing pipeline on affected feeds and checked for downstream effects in route geometry, stops, metadata and the map outputs. Atlas also reviews representative and surprising cases manually. This layered process gives the methodology broad coverage while keeping the results understandable: a count usually refers to a route-period observation, not necessarily a unique route.</p>
            <SubsectionTitle>1. Source and Freshness Checks</SubsectionTitle>
            <p>Before processing, Atlas records where a feed came from, when it was published or retrieved, and which schedule period it represents. Active-feed audits identify expired URLs, stale schedules, duplicate agency submissions and sources that have changed shape or availability. Official agency sources are preferred, while provider mirrors are treated as fallbacks rather than equivalent evidence.</p>
            <p>The refresh process also inspects <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, calendar end dates, and calendar exceptions before deciding what “current” means. A feed containing a future schedule and an expired schedule is not allowed to choose one simply because it appears first in the ZIP file.</p>
            <SubsectionTitle>2. Structural Feed Checks</SubsectionTitle>
            <p>The validator checks required GTFS tables and relationships: routes must connect to trips, trips must connect to calendars and stop times, stop times must reference usable stops or supported Flex locations, and shapes must be readable when geometry is expected. It also checks required fields, duplicate IDs, invalid route types, missing times, orphaned records, routes with no trips and coordinates outside the valid geographic range.</p>
            <p>Checks have different severities. An error blocks or skips unsafe processing; a warning records a problem that may be safely excluded or handled; and an informational result describes something unusual without claiming it is wrong. For example, a missing <code className="text-xs text-[var(--text-primary)]">shapes.txt</code> is not treated the same way as a missing route identifier.</p>
            <SubsectionTitle>3. Processing and Plausibility Checks</SubsectionTitle>
            <p>After normalization, Atlas checks route counts, direction assignment, branch and shape selection, stop coverage, trip durations, headways, service windows and frequency tiers. It looks for signals such as implausibly short headways, missing geometry, a route disappearing between stages, or a time period claiming service outside its actual operating window.</p>
            <p>This is also where Atlas separates things that are easy to accidentally combine: a route’s display geometry is not automatically its analysis geometry; a median headway is not automatically a sustained frequency tier; and a route that runs only at night is not automatically an invalid route. Coverage, regularity and cadence are checked as separate properties before they are presented together.</p>
            <SubsectionTitle>4. Corrections and Exception Audits</SubsectionTitle>
            <p>Known feed problems are corrected only with a narrow, documented rule. Separate audits review agency-specific overrides, hidden routes, geometry repairs, removed non-revenue patterns, placeholder destinations and other exceptions so a local fix does not become an undocumented global assumption.</p>
            <p>Overrides are rechecked when the upstream feed changes. If a new feed no longer contains a route that was excluded, Atlas flags that exclusion as potentially resolved, and correction notes tied to the old feed are cleared. If the issue remains, the maintainer must re-verify it against the new source rather than assuming that yesterday’s correction still applies.</p>
            {FEATURES.onDemand && <>
            <SubsectionTitle>5. GTFS-Flex and On-Demand Checks</SubsectionTitle>
            <p>Flex service is validated separately because its data model is different from fixed-route service. Atlas checks the required Flex files, location groups, group-to-stop links, service areas, virtual stops, booking rules, and Flex stop-time rows. An unlinked location group or a feed with no usable Flex trips fails review rather than becoming an empty-looking service zone.</p>
            <p>Atlas keeps the result in a separate on-demand view rather than calculating ordinary route frequency from it. Where a feed is incomplete or unavailable, Atlas uses an official geometry source only when the relationship is documented and visible. A missing polygon is not silently replaced with an invented boundary.</p>
            </>}
            <SubsectionTitle>{5 + flexStep}. Independent Source Review</SubsectionTitle>
            <p>Some facts cannot be established from GTFS alone. Atlas separately reviews official agency pages, service-area maps, system maps and agency guides. Each review records what source was checked, what claim it supports and whether the source is current enough to use.</p>
            <p>This is especially important for {FEATURES.onDemand ? 'on-demand coverage and ' : ''}system maps. A feed can prove that a route exists, but it may not prove that a service area is still active or that a map is the official current one. Those claims stay provisional or are excluded when the evidence is not strong enough.</p>
            <SubsectionTitle>{6 + flexStep}. Output and Interface Checks</SubsectionTitle>
            <p>Finally, Atlas checks the published output: route files, stop indexes, vector tiles, metadata, map filters, route cards and links. The goal is to catch disagreements between the processed data and what a person can actually see or select in the application.</p>
            <p>Published files are checked for coverage and shape integrity, not just whether they uploaded successfully. The browser is checked against those files because a correct pipeline result can still be presented incorrectly by a stale index, a missing tile, a mismatched route key or a filter that uses a different definition than the route card.</p>
            <SubsectionTitle>{7 + flexStep}. Manual Review and Feedback</SubsectionTitle>
            <p>Automated checks are supplemented by manual spot checks. When someone familiar with a city’s network notices a route, branch, shape, schedule or frequency that looks wrong, Atlas compares the result against the source feed and the agency’s published information rather than assuming the automated output is correct.</p>
            <p>Atlas also includes a Feedback link and a “{REPORT_A_PROBLEM}” form on route, stop and agency cards, which opens a pre-filled email. Reports can identify problems with routes, branches, names, frequencies, schedules, shapes, stops, filters, {FEATURES.live ? 'live information, ' : ''}or stale data, and the route report can include the loaded metric context needed to reproduce the result.</p>
            <p>A report is evidence for review, not an automatic correction. The issue is reproduced against the relevant feed and processing stage, then the response may be a code fix, a feed-specific transform, a quality notice, a source update or a decision to leave the result unchanged when the source supports it.</p>
            <SubsectionTitle>What Happens When a Check Fails</SubsectionTitle>
            <p>Atlas does not use one automatic response for every problem:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Reject:</strong> stop processing when the feed cannot be interpreted safely, such as when required relationships are missing or coordinates are invalid.</li>
              <li><strong className="text-[var(--text-primary)]">Exclude:</strong> leave a specific row, trip, route, shape, or Flex record out when it is clearly unusable but the rest of the feed remains valid.</li>
              <li><strong className="text-[var(--text-primary)]">Correct:</strong> apply a narrow rule when the intended interpretation is supported and the change can be tested.</li>
              <li><strong className="text-[var(--text-primary)]">Annotate:</strong> publish a quality note when the source problem is real but removing it would hide information Atlas users may need to interpret the result.</li>
              <li><strong className="text-[var(--text-primary)]">Hold for review:</strong> keep a feature in beta, research or an audit queue when the evidence is not strong enough for the public map.</li>
            </ul>
            <p>These checks do not make the underlying agency data perfect. They make the limits visible, prevent known errors from being amplified, and give each correction or research claim a traceable reason for existing.</p>
          </Section>

          <Section id="notices">
            <p>Notices appear on route, stop and agency cards when something about the schedule needs a word of explanation. They fall into these groups.</p>
            {NOTICE_GROUPS.filter(group => FEATURES.onDemand || !group.onDemand).map(group => (
              <Subsection key={group.title} title={group.title}>
                <p>{group.text}</p>
                <ul className="list-disc pl-5 space-y-1">
                  {group.examples.map(example => <li key={example}>“{example}”</li>)}
                </ul>
              </Subsection>
            ))}
          </Section>

          <Section id="glossary">
            <p><strong className="text-[var(--text-primary)]">GTFS:</strong> A standard set of files describing transit routes, stops, trips, calendars and shapes. Agencies publish it, and Atlas reads it.</p>
            <p><strong className="text-[var(--text-primary)]">GTFS-Flex:</strong> GTFS extensions for demand-responsive service, including service areas, location groups, virtual stops and booking rules.</p>
            <p><strong className="text-[var(--text-primary)]">Headway:</strong> The time between one scheduled departure and the next. For a rider who just missed a bus, it is roughly the wait for the next one.</p>
            <p><strong className="text-[var(--text-primary)]">Frequency:</strong> How often a route runs. Atlas shows what the schedule promises, not what happened on the street.</p>
            <p><strong className="text-[var(--text-primary)]">“Every N min”:</strong> The time between trips in the selected period. A range such as “{headwayEveryRange(8, 25)}” means your wait is between the two: on a card it’s one row’s waits, and in a list it runs from the shared stretch to the least frequent branch.</p>
            <p><strong className="text-[var(--text-primary)]">Frequency tier:</strong> A broad band, such as {TIER_LIST.replace(/ and /, ' or ')}, used to colour and filter routes on the map. The filter and the legend show it as “≤10 min”.</p>
            <p><strong className="text-[var(--text-primary)]">Route rating:</strong> {ROUTE_RATING}</p>
            <p><strong className="text-[var(--text-primary)]">Service period:</strong> A named time window: {PERIOD_LABELS.amPeak} ({PERIOD_TIMES.amPeak}), {PERIOD_LABELS.midday} ({PERIOD_TIMES.midday}), {PERIOD_LABELS.pmPeak} ({PERIOD_TIMES.pmPeak}), {PERIOD_LABELS.evening} ({PERIOD_TIMES.evening}), {PERIOD_LABELS.late} ({PERIOD_TIMES.late}), or {PERIOD_LABELS.overnight} ({PERIOD_TIMES.overnight}). Each period is measured on its own. A quiet evening is not hidden by a busy midday.</p>
            <p><strong className="text-[var(--text-primary)]">Branch:</strong> One of several paths under one route number, such as trips that split to different destinations or turn back early. The route card lists each one with its own frequency.</p>
            <p><strong className="text-[var(--text-primary)]">Shared stretch:</strong> The part of a route where its branches run together, and riders there get every branch’s trips. The card shows it as “{SHARED_STRETCH_LABEL}”. It never makes the whole route pass the filter.</p>
            <p><strong className="text-[var(--text-primary)]">Irregular:</strong> Shown for a time period when a route runs but its trips don’t come at a consistent gap, so there is no frequency to give. Route cards say “{IRREGULAR_PERIOD_LABEL}”; tables and lists say “{IRREGULAR_PERIOD_SHORT_LABEL}”.</p>
            <p><strong className="text-[var(--text-primary)]">Service class:</strong> The kind of service a route runs: regular, part-time or occasional.</p>
            <p><strong className="text-[var(--text-primary)]">Occasional:</strong> {HIDE_ONE_OFF_SETTING.description} “{HIDE_ONE_OFF_SETTING.label}” hides them.</p>
            <p><strong className="text-[var(--text-primary)]">Consistent service:</strong> Service whose gaps stay within a small allowance across the whole time period, not only in a short burst.</p>
            <p><strong className="text-[var(--text-primary)]">Uneven service:</strong> Service that runs through the whole time period, but with gaps that vary.{FEATURES.unevenBanner && ' The card names the longest gap.'}</p>
            {FEATURES.onDemand && <p><strong className="text-[var(--text-primary)]">On-demand zone:</strong> An area served by booked rides instead of a fixed route. It is shown as an area on the map and never given a frequency.</p>}
            <p><strong className="text-[var(--text-primary)]">Provenance:</strong> The source, schedule period, freshness state, review status and correction history attached to an Atlas result.</p>
            <p><strong className="text-[var(--text-primary)]">PMTiles:</strong> A single archive format that lets the map request only the vector-tile regions it needs.</p>
            {/* The Live report pages link here ("What these terms mean"), so the terms follow their flag. They load in the
                browser only: the prerender's renderToString can't wait for a lazy chunk, and wrote React's error text with the
                build machine's path into the page instead (#1524). The page mounts fresh in the browser (createRoot), so there
                is nothing to hydrate against. */}
            {FEATURES.liveReports && typeof window !== 'undefined' && <Suspense fallback={null}><LiveGlossaryTerms /></Suspense>}
          </Section>

          <SiteContact title="Technical Questions and Feedback" subject="Atlas Feedback" linkLabel="Contact us with a question or correction">
            Questions about the methodology, a suspected data problem or a transit agency’s coverage are welcome. Feedback is most useful when it identifies the agency, route, schedule period and specific result that needs review.
          </SiteContact>
    </DocsPageLayout>
  );
}
