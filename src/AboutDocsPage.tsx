import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import SiteContact from './components/SiteContact';
import SiteFooter from './components/SiteFooter';

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-base font-black mb-2">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--text-dim)]">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-black text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}

export default function AboutDocsPage() {
  const isPublicDocs = ATLAS_MODE === 'public';
  const showBetaFeatures = FEATURES.beta;
  const showLive = FEATURES.live;
  const showHistory = FEATURES.history;
  const showResearch = FEATURES.researchApps;

  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Atlas
        </a>

        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <nav aria-label="Documentation sections" className="mb-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-4 lg:sticky lg:top-8 lg:mb-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-14">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)] mb-2">On this page</p>
            <div className="mb-4 border-b border-[var(--border-primary)] pb-4 lg:border-b-0 lg:pb-0" aria-label="Documentation environment">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--text-muted)]">Docs version</p>
              <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-bold ${isPublicDocs ? 'border-[var(--accent-border)] text-[var(--accent)]' : 'border-amber-500/40 text-amber-500'}`}>
                {isPublicDocs ? 'Public documentation' : 'Beta documentation'}
              </span>
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-muted)]">
                {isPublicDocs ? 'Covers features available on the public Atlas deployment.' : 'Includes Beta features and research surfaces enabled for this deployment.'}
              </p>
            </div>
            <div className="grid gap-1.5 text-sm lg:block lg:space-y-2">
              <a className="block text-[var(--accent)] hover:underline" href="#overview">Overview</a>
              <a className="block text-[var(--accent)] hover:underline" href="#what-atlas-does">Capabilities</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-model">Model</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-products">Products</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-flow">Pipeline</a>
              <a className="block text-[var(--accent)] hover:underline" href="#frequency">Frequency</a>
              <a className="block text-[var(--accent)] hover:underline" href="#service-classification">Service</a>
              <a className="block text-[var(--accent)] hover:underline" href="#map-architecture">Mapping</a>
              <a className="block text-[var(--accent)] hover:underline" href="#corrections">Corrections</a>
              <a className="block text-[var(--accent)] hover:underline" href="#pipeline-changes">Change process</a>
              <a className="block text-[var(--accent)] hover:underline" href="#quality">Quality</a>
              <a className="block text-[var(--accent)] hover:underline" href="#validation">Validation</a>
              <a className="block text-[var(--accent)] hover:underline" href="#glossary">Glossary</a>
            </div>
          </nav>

          <article className="space-y-8">
          <header>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">Documentation</h1>
            </div>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-dim)]">
              A technical overview of how Atlas turns published transit data into analysed, verified, and mapped service information.
            </p>
          </header>

          <Section id="overview" title="Overview">
            <h3 className="font-black text-[var(--text-primary)]">What Atlas is</h3>
            <p>Atlas is a transit analysis platform with a client-side application for comparing scheduled service across agencies and cities.</p>
            <p>It turns published transit schedules into map layers, route summaries, stop-level frequency estimates, and network comparisons.</p>
            <h3 className="font-black text-[var(--text-primary)]">Design principles</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">One shared data platform:</strong> route, stop, and freshness data are processed into stable outputs for the tools that use them. Additional history and real-time outputs appear only where those features are enabled.</li>
              <li><strong className="text-[var(--text-primary)]">Honest measurements:</strong> when a period does not contain enough sustained service to support a meaningful frequency claim, Atlas flags that limitation instead of tuning the calculation until it produces a plausible-looking number.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">Preserved history:</strong> historical feeds are treated as dated snapshots. Missing or unusable periods remain unavailable rather than being duplicated or inferred.</li>}
              <li><strong className="text-[var(--text-primary)]">Stable contracts:</strong> new information is added alongside existing outputs when possible, so a downstream tool does not silently reinterpret previously published data.</li>
            </ul>
          </Section>

          <Section id="what-atlas-does" title="Capabilities">
            <p>Atlas is more than a map renderer. It is a shared transit-data platform with several layers of work:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Network exploration:</strong> search agencies, routes, stops, and nearby service across a large catalogue.</li>
              <li><strong className="text-[var(--text-primary)]">Frequency analysis:</strong> compare service by day type, time period, route branch, direction, and stop.</li>
              <li><strong className="text-[var(--text-primary)]">Data quality:</strong> expose source dates, stale schedules, review states, corrections, geometry repairs, and known limitations.</li>
              <li><strong className="text-[var(--text-primary)]">Specialized service:</strong> represent on-demand and GTFS-Flex service as zones or virtual stops where a fixed route is the wrong model.</li>
              <li><strong className="text-[var(--text-primary)]">Additional analysis:</strong> support fares and other focused analyses. {showResearch ? 'Beta also exposes historical schedule comparisons, night-service research, frequent-service research, and other validation surfaces.' : 'Research and validation surfaces are documented in the Beta version of this page.'}</li>
              <li><strong className="text-[var(--text-primary)]">Reusable data infrastructure:</strong> publish stable route, stop, tile, and freshness contracts that other transit tools can consume.</li>
            </ul>
            <p>Some surfaces are public, some are in beta, and some remain research or validation tools. The same processed data model supports all of them without making every experimental feature part of the main map.</p>
            {showLive && <p>Live is a separate GTFS-Realtime path: it polls configured agency feeds for vehicle positions, trip updates, and selected observed headways. Coverage is route-specific, may be partial, and is never treated as proof that the scheduled frequency calculation is current.</p>}
          </Section>

          <Section id="data-model" title="Model">
            <p>Atlas keeps several kinds of transit information separate because they answer different questions:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Schedule data</strong> describes what an agency publishes for planned service.</li>
              <li><strong className="text-[var(--text-primary)]">Processed metrics</strong> describe what Atlas derives from that schedule, such as headways, tiers, coverage, and route branches.</li>
              <li><strong className="text-[var(--text-primary)]">Provenance and quality</strong> describe the source, freshness, review state, and corrections attached to a result.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">Historical data</strong> describes documented past schedule periods rather than pretending current data is historical.</li>}
              {showLive && <li><strong className="text-[var(--text-primary)]">Real-time data</strong> describes observed vehicle or adherence information and is never silently mixed with schedule frequency.</li>}
            </ul>
            <p>This separation is one of Atlas’s core design principles: a useful number is not automatically a trustworthy number unless its source, meaning, and time period are clear.</p>
          </Section>

          <Section id="data-products" title="Products">
            <p>Different transit questions need different products. Atlas keeps these surfaces related but does not force them into one overloaded route card:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Frequency:</strong> current scheduled cadence, period filters, route variants, stop-level metrics, and map colouring.</li>
              <li><strong className="text-[var(--text-primary)]">Fares:</strong> base adult fare information derived from GTFS Fares V1 or V2 when available, with explicitly labelled manual fallbacks where a feed is incomplete.</li>
              {showHistory && <li><strong className="text-[var(--text-primary)]">History:</strong> selected agencies with usable archived GTFS periods, showing documented service changes without fabricating missing years.</li>}
              <li><strong className="text-[var(--text-primary)]">On-demand service:</strong> GTFS-Flex and source-backed service areas represented separately from fixed-route frequency so booking-based service is not misread as a normal route.</li>
              {showResearch && <li><strong className="text-[var(--text-primary)]">Research:</strong> focused datasets and analyses for night service, frequent-service criteria, fares, transfers, system maps, and other questions that need source review before becoming general map features.</li>}
            </ul>
            {showHistory && <p>The History eligibility rule requires at least 10 distinct snapshot years. Historical route identity is matched by exact route name by default, with explicit aliases for documented redesigns.</p>}
            {showResearch && <p>Research outputs can become product features only after their definitions, coverage, and source quality are clear. This is why Atlas sometimes contains a capability in the data or code before exposing it in the primary navigation.</p>}
          </Section>

          <Section id="data-flow" title="Pipeline">
            <p>Atlas primarily ingests General Transit Feed Specification (GTFS) schedule data published by transit agencies and transit data providers. An official agency feed is preferred; a provider-hosted mirror or fallback may be used when the primary source is unavailable.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Feeds are downloaded and checked on a recurring refresh schedule.</li>
              <li>The pipeline identifies the schedule periods that are active around the refresh date.</li>
              <li>Routes, stops, calendars, trips, stop times, and shapes are normalized into a shared model.</li>
              <li>Frequency metrics and quality signals are calculated from the normalized schedule.</li>
              <li>Static route data, stop indexes, and vector tiles are published to object storage.</li>
              <li>The browser loads only the data needed for the current map view and selected agency.</li>
            </ol>
            <p>Atlas does not require an account or a user database. The deployed frontend and public transit artifacts are separate so data refreshes do not require a frontend release.</p>
            <Subsection title="GTFS inputs">
              <p>Atlas consumes GTFS Schedule as a relational set of core tables, calendar rules, optional geometry, and optional extensions. It joins those records into a normalized analysis model before producing map and service metrics:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><code className="text-[var(--text-primary)]">routes.txt</code> identifies services and their public route names;</li>
                <li><code className="text-[var(--text-primary)]">trips.txt</code> identifies individual scheduled runs and, when supplied, their directions;</li>
                <li><code className="text-[var(--text-primary)]">stop_times.txt</code> supplies the scheduled arrivals and departures;</li>
                <li><code className="text-[var(--text-primary)]">stops.txt</code> supplies names and coordinates; and</li>
                <li><code className="text-[var(--text-primary)]">calendar.txt</code>, <code className="text-[var(--text-primary)]">calendar_dates.txt</code>, and feed dates determine when trips operate.</li>
              </ul>
              <p>Shapes and route metadata describe where a service runs, but the frequency numbers come from scheduled departures. A visually long route is not automatically a frequent route.</p>
              <p>Atlas also reads <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, <code className="text-xs text-[var(--text-primary)]">shapes.txt</code>, and GTFS-Flex extensions where present. A feed without <code className="text-xs text-[var(--text-primary)]">shapes.txt</code> can still contain usable schedule data, so Atlas falls back to stop-to-stop straight-line geometry and records a validation warning. Missing route identifiers, broken trip relationships, invalid coordinates, or no usable route output are more serious and can prevent publication.</p>
              <p>GTFS-Flex adds inputs including <code className="text-xs text-[var(--text-primary)]">locations.geojson</code>, <code className="text-xs text-[var(--text-primary)]">location_groups.txt</code>, <code className="text-xs text-[var(--text-primary)]">location_group_stops.txt</code>, and <code className="text-xs text-[var(--text-primary)]">booking_rules.txt</code>. Atlas validates those separately rather than forcing them through fixed-route assumptions.</p>
            </Subsection>
            <Subsection title="Schedule selection">
              <p>Feeds commonly contain past, current, and future service at the same time. Atlas evaluates the feed’s calendar dates around the refresh date and selects the schedule period that is active for the map.</p>
              <p>It then separates departures by day type—weekday, Saturday, and Sunday—and by named time period. This prevents an expired schedule or a future seasonal timetable from being treated as today’s service.</p>
              <p>After publication, the agency’s source date and freshness state remain visible in Atlas so users can see when the underlying schedule was last checked.</p>
            </Subsection>
            <Subsection title="Routes, branches, and shapes">
              <p>A public route name can represent several patterns: branches, short turns, directions, destinations, or trips that only operate during part of the day. Atlas keeps those patterns distinct long enough to calculate meaningful service, then presents them through route and branch summaries.</p>
              <p>For map display, Atlas selects representative geometry for the active service patterns. For analysis, it avoids allowing a short branch or clearly excluded trip pattern to distort the frequency of the main route.</p>
              <p>This is why the line shown on the map, the cadence shown on a route card, and the cadence used by a frequency filter can be related but not identical measurements.</p>
            </Subsection>
          </Section>

          <Section id="frequency" title="Frequency">
            <p>Atlas calculates scheduled headways: the time between consecutive departures. It reads departure times from <code className="text-[var(--text-primary)]">stop_times.txt</code> and expands valid frequency-based trips from <code className="text-[var(--text-primary)]">frequencies.txt</code>; it does not treat that optional table as a single route-level answer.</p>
            <p>Departures are grouped by route, direction, headsign, physical shape, stop, day type, and service period. For a group of departures, Atlas sorts the consecutive gaps and uses the median gap as the typical scheduled headway.</p>
            <p>The median is intentionally resistant to outliers. One unusually long gap should not make an otherwise regular 10-minute service look like 30-minute service.</p>
            <p>Period calculations are kept inside their own time windows. Atlas does not silently borrow an all-day average to fill a period with sparse or missing service.</p>
            <p>Atlas keeps separate projections for display cadence, filter cadence, branch cadence, shared-section cadence, and stop-specific cadence. A stop or shared section can have a different value from the whole route because it may combine branches or cover only part of the route.</p>
            <p>Period output also carries separate longest-gap and sustained-service signals. These diagnostics can mark a median as unrepresentative without changing the stored median or silently filling the gap with an all-day value.</p>
            <Subsection title="Directions, branches, and route qualification">
              <p>Atlas calculates each scheduled direction separately before deciding whether a route qualifies. It uses the feed’s <code className="text-xs text-[var(--text-primary)]">direction_id</code> when present. If that field is missing, trips fall into the default direction group, Atlas records a warning, and the resulting headway may be understated because opposite directions may have been merged.</p>
              <p>Within a direction, Atlas also separates different headsigns and physical shapes so branches and short turns do not get mixed into one artificially frequent series. Surface routes keep the longest meaningful shape groups for analysis, with a trip-volume fallback when length alone would discard most of the service; rail-like routes use their longest available shape. These are analysis choices, not claims that the feed’s direction labels are always correct.</p>
              <p>Numeric frequency-tier qualification is direction-aware. For a period or all-day threshold, Atlas uses the worst qualifying direction or branch so a route does not pass solely because one direction is frequent while the other is materially slower. For example, a 10-minute direction paired with a 30-minute direction does not qualify the route for a 10-minute threshold; it can qualify for a 30-minute threshold if the other route-level checks also pass. The separate “All” service view is broader by design: it can show service in only one direction or service that has not qualified for a numeric tier. A route/day with a direction that has no sustained, real-tier pattern can also be marked irregular as a whole and hidden by the default irregular-service filter.</p>
            </Subsection>
            <h3 className="font-black text-[var(--text-primary)]">Band qualification and tolerance</h3>
            <p>Atlas tests the tightest band first and requires enough departures to cover the analyzed span at that band. For a target of <code className="text-xs text-[var(--text-primary)]">T</code> minutes, the minimum trip count is based on <code className="text-xs text-[var(--text-primary)]">ceil(span ÷ T)</code>.</p>
            <p>A gap at or below <code className="text-xs text-[var(--text-primary)]">T</code> passes directly. A slightly longer gap can count as a near miss when it is no more than <code className="text-xs text-[var(--text-primary)]">T + max(5 minutes, 15% of T)</code>. Only <code className="text-xs text-[var(--text-primary)]">max(2, floor(30% × number of gaps))</code> near misses may use that allowance. A gap beyond the tolerance, or too many near misses, disqualifies the band and Atlas tests the next slower one.</p>
            <p>The current implementation retains a five-minute absolute floor, which makes the effective percentage larger for the faster bands:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[var(--text-primary)]">
                  <tr>
                    <th className="py-1 pr-4 font-bold">Target band</th>
                    <th className="py-1 pr-4 font-bold">Near-miss limit</th>
                    <th className="py-1 font-bold">Effective allowance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="py-1 pr-4">10 minutes</td><td className="py-1 pr-4">15 minutes</td><td className="py-1">50%</td></tr>
                  <tr><td className="py-1 pr-4">15 minutes</td><td className="py-1 pr-4">20 minutes</td><td className="py-1">33%</td></tr>
                  <tr><td className="py-1 pr-4">20 minutes</td><td className="py-1 pr-4">25 minutes</td><td className="py-1">25%</td></tr>
                  <tr><td className="py-1 pr-4">30 minutes</td><td className="py-1 pr-4">35 minutes</td><td className="py-1">17%</td></tr>
                  <tr><td className="py-1 pr-4">60 minutes</td><td className="py-1 pr-4">69 minutes</td><td className="py-1">15%</td></tr>
                </tbody>
              </table>
            </div>
            <p>The near-miss limit is only one part of the rule: Atlas rounds the 30% count down and never allows fewer than two tolerated gaps. Rail uses the same tolerance logic, with additional 5- and 8-minute target bands in the processing model; those bands are not separate options in the main map filter.</p>
            <p>This allowance is intended to handle ordinary schedule rounding and small deviations without turning a genuinely uneven route into a frequent one. A large gap is still a failure even if the median looks good, and the final tier is the fastest band that survives the full check. Atlas is still auditing how often the tolerance is used in real feeds before treating that behaviour as a settled quality result.</p>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-3">
              <p className="font-bold text-[var(--text-primary)]">Frequency bands</p>
              <p className="mt-1">The main Frequency control currently exposes service at or below 10, 15, 20, 30, and 60 minutes. Service slower than 60 minutes, or service that does not qualify for a sustained band, appears as infrequent in that surface.</p>
              {showResearch && <p className="mt-2">The separate Frequent Service research view uses 15- and 30-minute criteria. Those criteria are distinct from the main map’s general-purpose filter.</p>}
            </div>
            <Subsection title="Sustained service and long gaps">
              <p>A median alone can hide an important gap. For example, departures might be every 30 minutes during a period except for one three-hour hole. Atlas keeps additional coverage and longest-gap signals so a route can be marked as uneven instead of presenting the median as the whole story.</p>
              <p>Frequency tiers therefore require sustained service across the relevant window. A route does not qualify for a fast tier simply because it has a short burst of frequent trips at one edge of the period.</p>
              <p>When a route operates only during part of the day, Atlas records that absence as an empty period rather than copying its operating-period value into the rest of the day.</p>
            </Subsection>
          </Section>

          <Section id="service-classification" title="Service">
            <p>Frequency and regularity are separate properties. A route can run every 30 minutes and still be irregular if it only operates for a short burst or has too few repeated departures to establish a sustained pattern.</p>
            <dl className="space-y-2">
              <div><dt className="font-bold text-[var(--text-primary)]">Regular</dt><dd>Service covers the normal analysis window. It may be frequent or infrequent.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Time-limited</dt><dd>Predictable service operates during part of the day and has enough repeated departures for a meaningful frequency estimate.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Irregular</dt><dd>Exceptional, very short, one-sided, or otherwise unsustained service that should not be presented as a normal route cadence.</dd></div>
            </dl>
            <p>The default irregular-service filter hides irregular patterns while keeping predictable time-limited service visible. Periods outside a time-limited route’s operation remain empty rather than inheriting an all-day value.</p>
          </Section>

          <Section id="map-architecture" title="Mapping">
            <p>The frontend is a React application using MapLibre for map interaction and rendering. Route geometry is distributed in vector tiles for broad map views, while agency detail and stop indexes are loaded as smaller JSON artifacts when needed.</p>
            <p>At a high level, the browser combines three kinds of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>agency metadata, coverage, source dates, and quality notices;</li>
              <li>route geometry and serialized frequency properties; and</li>
              <li>stop coordinates and route-specific service metrics.</li>
            </ul>
            <p>This separation keeps the initial map responsive and lets Atlas update schedule data independently from the application interface.</p>
            <Subsection title="Why values can differ across the interface">
              <p>Atlas exposes several legitimate views of service:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-[var(--text-primary)]">Display cadence</strong> describes the route or destination a person is looking at.</li>
                <li><strong className="text-[var(--text-primary)]">Filter cadence</strong> determines whether a route qualifies for a selected frequency threshold.</li>
                <li><strong className="text-[var(--text-primary)]">Stop cadence</strong> describes service at a specific boarding stop.</li>
                <li><strong className="text-[var(--text-primary)]">Shared-section cadence</strong> describes the combined service where branches overlap.</li>
              </ul>
              <p>These projections answer different questions. A route can qualify because one useful section is frequent while its terminal service is slower; Atlas labels the surfaces rather than pretending there is one universal number.</p>
            </Subsection>
            <Subsection title="Public outputs">
              <p>After processing, Atlas publishes a set of read-only artifacts for the frontend:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>route geometry with serialized service metrics;</li>
                <li>a lightweight stop index for searching and stop-specific views;</li>
                <li>trip and stop-metadata sidecars used for live matching, stop facts, and downstream consumers;</li>
                {showResearch && <li>separate corridor and research indexes where those surfaces are enabled;</li>}
                <li>vector tiles for efficient map rendering; and</li>
              <li>agency metadata describing coverage, freshness, sources, and quality status.</li>
              </ul>
              <p>The artifacts contain processed public transit information. They do not contain user accounts, private analytics records, feed credentials, or the raw maintainer workflow.</p>
            </Subsection>
          </Section>

          <Section id="corrections" title="Corrections">
            <p>Atlas does not treat every source feed as ready for publication. Corrections happen at different layers, and the layer matters:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Parsing repairs</strong> address malformed source structures, such as broken or interleaved route geometry, only when the repair is unambiguous and validated.</li>
              <li><strong className="text-[var(--text-primary)]">Normalization rules</strong> reconcile feed conventions, synthesize usable directions, remove duplicate patterns, and separate branches or short turns that would otherwise distort analysis.</li>
              <li><strong className="text-[var(--text-primary)]">User-facing corrections</strong> remove known non-revenue trips, placeholder destinations, duplicate source service, or other values that do not represent the published service.</li>
              <li><strong className="text-[var(--text-primary)]">Agency-specific overrides</strong> handle a documented feed problem that cannot safely become a global rule. These are scoped to the affected agency, route, shape, or source snapshot.</li>
              <li><strong className="text-[var(--text-primary)]">Quality annotations</strong> preserve problems that should not be silently “fixed,” such as missing shapes, stale feeds, route-frequency mismatches, or unresolved geometry.</li>
            </ul>
            <p>Atlas does not overwrite the upstream GTFS ZIP. It parses the source into an internal data model, applies validated transforms there, and publishes new derived artifacts. Those transforms can filter unusable routes or trips, merge equivalent branches, synthesize missing direction metadata, normalize agency-specific conventions, or repair clearly identifiable geometry problems.</p>
            <p>Geometry repairs are conservative: when the parser cannot establish an unambiguous repair, it keeps the original geometry and records the anomaly for review rather than inventing a replacement. The source snapshot remains distinguishable from Atlas’s processed output.</p>
            <p>Every correction should have a reason, a narrow scope, and a validation check. A general rule is only preferred when it has been tested against unrelated agencies; otherwise Atlas uses a targeted exception rather than risking a larger silent change.</p>
            <p>Corrections are tied to the source data that required them. When a new upstream feed arrives, Atlas rechecks whether the correction is still needed instead of treating the old exception as permanent truth.</p>
            <p>Where a correction affects interpretation, Atlas can show a public note on the relevant agency or route. The goal is not to make imperfect data look perfect; it is to make the processing decision visible and bounded.</p>
          </Section>

          <Section id="pipeline-changes" title="How pipeline changes are made">
            <p>Changes to the pipeline are treated as changes to published data, not only as code changes. The first step is to identify the narrowest affected layer: one agency, a feed family, or shared processing used by every agency.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Reproduce the problem against the source feed and identify the first stage where the result diverges.</li>
              <li>Add a regression test for the reported case and a legitimate case that a broader fix could accidentally change.</li>
              <li>Prefer an agency-specific override or narrow transform when the evidence does not support a global rule.</li>
              <li>For a shared pipeline change, run the full test suite, dry-run the affected feed, and compare the output before and after.</li>
              <li>Check at least six additional trusted agencies, spanning two countries when applicable, and investigate every unexplained output change.</li>
              <li>Record the agencies, commands, output diff, and validation result with the change before it is committed.</li>
            </ol>
            <p>Publishing is a separate step. A refresh or processing command can write directly to the live public data bucket, so it requires explicit maintainer approval. New or materially changed map data also needs the required tile rebuild, upload, and coverage verification; a successful code build alone does not prove that the public artifacts are correct.</p>
            <p>When a source feed changes, Atlas rechecks the correction against the new source. A past exception is not treated as permanent truth, and a newer file is not promoted merely because its date is newer if it fails processing or validation.</p>
          </Section>

          <Section id="quality" title="Quality">
            <p>Atlas checks feeds for structural and service-data problems, including missing or unusual geometry, schedule inconsistencies, stale sources, and route-frequency anomalies. Some known source problems are corrected or annotated before publication.</p>
            <p>Feed-specific corrections are kept separate from the general methodology so a fix for one agency does not silently change every agency’s results.</p>
            <h3 className="font-black text-[var(--text-primary)]">A conservative publication rule</h3>
            <p>Atlas would rather show no result and clearly indicate that data is missing than show a precise-looking result that may be wrong. This applies to route geometry, frequency metrics, service areas, fares, transfers, and research findings.</p>
            <p>When the evidence is incomplete, Atlas can leave a route or field out, mark a result as unavailable or provisional, keep a feed in review, or preserve the last known artifact with a freshness warning. It does not fill gaps with a guessed value merely to make the map look complete.</p>
            <h3 className="font-black text-[var(--text-primary)]">How Atlas communicates data quality</h3>
            <p>Quality decisions are not meant to disappear behind a clean-looking map. Atlas surfaces user-relevant changes in the interface:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Corrected data:</strong> agency and route cards can say “We corrected this data,” with an explanation of the known feed problem and technical issue links when available.</li>
              <li><strong className="text-[var(--text-primary)]">Outdated schedules:</strong> route cards identify schedules that may no longer be current, including the schedule end date when known. The detail panel shows the last successful refresh and subsequent checks where those dates are available.</li>
              <li><strong className="text-[var(--text-primary)]">New schedule data:</strong> recently published feeds can be marked as “New schedule data is being verified” until Atlas checks them for missing service and quality problems.</li>
              {showBetaFeatures && <li><strong className="text-[var(--text-primary)]">Feed quality:</strong> beta quality controls distinguish Healthy, Review, Degraded, and Unusable feeds. The reasons can include validation warnings, adjusted shapes, route-versus-stop frequency differences, expired schedules, or no usable route output, along with the date checked.</li>}
              <li><strong className="text-[var(--text-primary)]">Route-level warnings:</strong> a route can carry a separate warning when its displayed geometry needed adjustment or its service data needs interpretation.</li>
            </ul>
            <p>Not every internal exclusion becomes a separate banner. Clearly unusable rows can be removed during processing without overwhelming the map with implementation details, while known user-facing corrections, stale schedules, review states, and material quality problems remain labelled where they affect interpretation.</p>
            <h3 className="font-black text-[var(--text-primary)]">How outdated data is flagged</h3>
            <p>Atlas determines schedule freshness from the service dates inside the feed, not only from the date the file was downloaded. It compares the latest usable date in <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, <code className="text-xs text-[var(--text-primary)]">calendar.txt</code>, and non-removal entries in <code className="text-xs text-[var(--text-primary)]">calendar_dates.txt</code> with the current date.</p>
            <p>During each refresh, Atlas records the feed’s expiry or version, the date it was last successfully processed, and the date it was most recently checked. If every available feed has expired, a download fails, or validation fails, Atlas marks the agency as stale and retains the last good published artifact instead of replacing it with broken or empty output.</p>
            <p>This also applies when a source publishes a newer GTFS file that is malformed or fails Atlas’s processing checks: the newer file is not promoted simply because it is newer. The active feed identity and last successful refresh remain unchanged while the failed candidate is recorded for retry or review.</p>
            <p>The interface then identifies that schedule as potentially outdated and shows the known end date, last successful refresh, and subsequent check history when available. If a newer feed arrives, Atlas can mark it as under review while it is checked for missing service and other quality problems. A feed can therefore be visible, stale, under review, degraded, or unusable as separate states rather than being silently treated as current.</p>
            <p>Atlas is schedule analysis, not real-time observation. It does not know whether a vehicle is delayed, cancelled, short-turned, crowded, or accessible unless an explicitly labelled feature provides that information.</p>
            <p>Source feeds can be delayed, incomplete, discontinued, or incorrect. For live alerts, accessibility information, trip planning, and emergency instructions, use the relevant transit agency’s official resources.</p>
          </Section>

          <Section id="validation" title="Validation">
            <p>Validation is the internal evidence chain behind those user-visible states. Atlas does not treat a feed as trustworthy merely because it parsed successfully: valid GTFS can still produce a misleading map, an implausible frequency, or a service area that should not be treated like a fixed route.</p>
            <h3 className="font-black text-[var(--text-primary)]">1. Source and freshness checks</h3>
            <p>Before processing, Atlas records where a feed came from, when it was published or retrieved, and which schedule period it represents. Active-feed audits identify expired URLs, stale schedules, duplicate agency submissions, and sources that have changed shape or availability. Official agency sources are preferred, while provider mirrors are treated as fallbacks rather than equivalent evidence.</p>
            <p>The refresh process also inspects <code className="text-xs text-[var(--text-primary)]">feed_info.txt</code>, calendar end dates, and calendar exceptions before deciding what “current” means. A feed containing a future timetable and an expired timetable is not allowed to choose one simply because it appears first in the ZIP file.</p>
            <h3 className="font-black text-[var(--text-primary)]">2. Structural feed checks</h3>
            <p>The validator checks required GTFS tables and relationships: routes must connect to trips, trips must connect to calendars and stop times, stop times must reference usable stops or supported Flex locations, and shapes must be readable when geometry is expected. It also checks required fields, duplicate IDs, invalid route types, missing times, orphaned records, routes with no trips, and coordinates outside the valid geographic range.</p>
            <p>Checks have different severities. An error blocks or skips unsafe processing; a warning records a problem that may be safely excluded or handled; and an informational result describes something unusual without claiming it is wrong. For example, a missing <code className="text-xs text-[var(--text-primary)]">shapes.txt</code> is not treated the same way as a missing route identifier.</p>
            <h3 className="font-black text-[var(--text-primary)]">3. Processing and plausibility checks</h3>
            <p>After normalization, Atlas checks route counts, direction assignment, branch and shape selection, stop coverage, trip durations, headways, service windows, and frequency tiers. It looks for signals such as implausibly short headways, missing geometry, a route disappearing between stages, or a time period claiming service outside its actual operating window.</p>
            <p>This is also where Atlas separates things that are easy to accidentally combine: a route’s display geometry is not automatically its analysis geometry; a median headway is not automatically a sustained frequency tier; and a route that runs only at night is not automatically an invalid route. Coverage, regularity, and cadence are checked as separate properties before they are presented together.</p>
            <h3 className="font-black text-[var(--text-primary)]">4. Corrections and exception audits</h3>
            <p>Known feed problems are corrected only with a narrow, documented rule. Separate audits review agency-specific overrides, hidden routes, geometry repairs, removed non-revenue patterns, placeholder destinations, and other exceptions so a local fix does not become an undocumented global assumption.</p>
            <p>Overrides are rechecked when the upstream feed changes. If a new feed no longer contains the route or pattern that required an exception, Atlas flags the old override as potentially resolved. If the issue remains, the maintainer must re-verify it against the new source rather than assuming that yesterday’s correction still applies.</p>
            <h3 className="font-black text-[var(--text-primary)]">5. GTFS-Flex and on-demand checks</h3>
            <p>Flex service is validated separately because its data model is different from fixed-route service. Atlas checks the required Flex files, location groups, group-to-stop links, service areas, virtual stops, booking rules, and Flex stop-time rows. An unlinked location group or a feed with no usable Flex trips fails review rather than becoming an empty-looking service zone.</p>
            <p>Atlas keeps the result in a separate on-demand view rather than calculating ordinary route frequency from it. Where a feed is incomplete or unavailable, Atlas uses an official geometry source only when the relationship is documented and visible. A missing polygon is not silently replaced with an invented boundary.</p>
            <h3 className="font-black text-[var(--text-primary)]">6. Independent source review</h3>
            <p>Some facts cannot be established from GTFS alone. Atlas separately reviews official agency pages, fare documents, transfer policies, service-area maps, system maps, and agency guides. Each review records what source was checked, what claim it supports, and whether the source is current enough to use.</p>
            <p>This is especially important for fares, transfers, system maps, and on-demand coverage. A feed can prove that a route exists, but it may not prove the current adult fare, whether a transfer is free, whether a service area is still active, or whether a map is an official current map. Those claims stay provisional or are excluded when the evidence is not strong enough.</p>
            <h3 className="font-black text-[var(--text-primary)]">7. Artifact and interface checks</h3>
            <p>Finally, Atlas checks the published output: route artifacts, stop indexes, vector tiles, metadata, map filters, route cards, links, and deployment modes. The goal is to catch disagreements between the processed data and what a person can actually see or select in the application.</p>
            <p>Published artifacts are checked for coverage and shape integrity, not just whether they uploaded successfully. The browser is checked against those artifacts because a correct pipeline result can still be presented incorrectly by a stale index, a missing tile, a mismatched route key, or a filter that uses a different definition than the route card.</p>
            <h3 className="font-black text-[var(--text-primary)]">8. Manual review and feedback</h3>
            <p>Automated checks are supplemented by manual spot checks. When someone familiar with a city’s network notices a route, branch, shape, schedule, or frequency that looks wrong, Atlas compares the result against the source feed and the agency’s published information rather than assuming the automated output is correct.</p>
            <p>Atlas also includes a Feedback control and an in-app “Report a problem” form. Reports can identify problems with routes, branches, names, frequencies, schedules, shapes, stops, filters, live information, or stale data, and the route report can include the loaded metric context needed to reproduce the result.</p>
            <p>A report is evidence for review, not an automatic correction. The issue is reproduced against the relevant feed and processing stage, then the response may be a code fix, a feed-specific transform, a quality notice, a source update, or a decision to leave the result unchanged when the source supports it.</p>
            <h3 className="font-black text-[var(--text-primary)]">What happens when a check fails</h3>
            <p>Atlas does not use one automatic response for every problem:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Reject:</strong> stop processing when the feed cannot be interpreted safely, such as when required relationships are missing or coordinates are invalid.</li>
              <li><strong className="text-[var(--text-primary)]">Exclude:</strong> leave a specific row, trip, route, shape, or Flex record out when it is clearly unusable but the rest of the feed remains valid.</li>
              <li><strong className="text-[var(--text-primary)]">Correct:</strong> apply a narrow rule when the intended interpretation is supported and the change can be tested.</li>
              <li><strong className="text-[var(--text-primary)]">Annotate:</strong> publish a quality note when the source problem is real but removing it would hide information Atlas users may need to interpret the result.</li>
              <li><strong className="text-[var(--text-primary)]">Hold for review:</strong> keep a feature in beta, research, or an audit queue when the evidence is not strong enough for the public map.</li>
            </ul>
            <p>These checks do not make the underlying agency data perfect. They make the limits visible, prevent known errors from being amplified, and give each correction or research claim a traceable reason for existing.</p>
          </Section>

          <Section id="glossary" title="Glossary">
            <p><strong className="text-[var(--text-primary)]">GTFS:</strong> A standard set of files describing transit routes, stops, trips, calendars, and shapes.</p>
            <p><strong className="text-[var(--text-primary)]">GTFS-Flex:</strong> GTFS extensions for demand-responsive service, including service areas, location groups, virtual stops, and booking rules.</p>
            <p><strong className="text-[var(--text-primary)]">Headway:</strong> The time between consecutive scheduled departures.</p>
            <p><strong className="text-[var(--text-primary)]">Service period:</strong> A named time window such as AM Peak, Midday, PM Peak, evening, or overnight.</p>
            <p><strong className="text-[var(--text-primary)]">Frequency tier:</strong> A broad band used to colour and filter service on the map.</p>
            <p><strong className="text-[var(--text-primary)]">Service class:</strong> The operating pattern assigned to a route or pattern: regular, time-limited, or irregular.</p>
            <p><strong className="text-[var(--text-primary)]">Sustained service:</strong> Service whose departure gaps remain within the qualification tolerance across the analysed window, rather than only appearing frequent in a short burst.</p>
            <p><strong className="text-[var(--text-primary)]">Provenance:</strong> The source, schedule period, freshness state, review status, and correction history attached to an Atlas result.</p>
            <p><strong className="text-[var(--text-primary)]">PMTiles:</strong> A single archive format that lets the map request only the vector-tile regions it needs.</p>
          </Section>

          <SiteContact title="Technical questions and feedback" subject="Atlas Feedback" linkLabel="Contact us with a question or correction">
            Questions about the methodology, a suspected data problem, or a transit agency’s coverage are welcome. Feedback is most useful when it identifies the agency, route, schedule period, and specific result that needs review.
          </SiteContact>

          <Section title="Privacy">
            <p>You can browse Atlas without an account. Read the <a className="text-[var(--accent)] hover:underline" href="/privacy">Privacy Policy</a> to learn about analytics and browser preferences.</p>
          </Section>

          <SiteFooter />
          </article>
        </div>
      </div>
    </main>
  );
}
