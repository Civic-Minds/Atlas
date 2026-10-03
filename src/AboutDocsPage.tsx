import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-base font-black mb-2">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--text-dim)]">{children}</div>
    </section>
  );
}

export default function AboutDocsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Atlas
        </a>

        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <nav aria-label="Documentation sections" className="mb-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-4 lg:sticky lg:top-8 lg:mb-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)] mb-2">On this page</p>
            <div className="grid gap-1.5 text-sm lg:block lg:space-y-2">
              <a className="block text-[var(--accent)] hover:underline" href="#what-atlas-does">What Atlas does</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-model">Data model</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-products">Data products</a>
              <a className="block text-[var(--accent)] hover:underline" href="#data-flow">Data flow</a>
              <a className="block text-[var(--accent)] hover:underline" href="#frequency">Frequency calculations</a>
              <a className="block text-[var(--accent)] hover:underline" href="#service-classification">Service classification</a>
              <a className="block text-[var(--accent)] hover:underline" href="#map-architecture">Map architecture</a>
              <a className="block text-[var(--accent)] hover:underline" href="#corrections">Data corrections</a>
              <a className="block text-[var(--accent)] hover:underline" href="#quality">Quality and limitations</a>
              <a className="block text-[var(--accent)] hover:underline" href="#validation">Validation and audit work</a>
              <a className="block text-[var(--accent)] hover:underline" href="#glossary">Glossary</a>
            </div>
          </nav>

          <article className="space-y-8">
          <header>
            <h1 className="text-3xl font-black tracking-tight">Documentation</h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-dim)]">
              A technical overview of Atlas’s data, methodology, and map architecture. This explains the public behaviour without requiring access to the source repository.
            </p>
          </header>

          <Section title="What Atlas is">
            <p>Atlas is a client-side transit analysis application for comparing scheduled service across agencies and cities.</p>
            <p>It turns published transit schedules into map layers, route summaries, stop-level frequency estimates, and network comparisons.</p>
          </Section>

          <Section id="what-atlas-does" title="What Atlas does">
            <p>Atlas is more than a map renderer. It is a shared transit-data platform with several layers of work:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Network exploration:</strong> search agencies, routes, stops, and nearby service across a large catalogue.</li>
              <li><strong className="text-[var(--text-primary)]">Frequency analysis:</strong> compare service by day type, time period, route branch, direction, and stop.</li>
              <li><strong className="text-[var(--text-primary)]">Data quality:</strong> expose source dates, stale schedules, review states, corrections, geometry repairs, and known limitations.</li>
              <li><strong className="text-[var(--text-primary)]">Specialized service:</strong> represent on-demand and GTFS-Flex service as zones or virtual stops where a fixed route is the wrong model.</li>
              <li><strong className="text-[var(--text-primary)]">Additional analysis:</strong> support fares, historical schedule comparisons, night-service research, frequent-service research, and stop-to-stop corridor analysis.</li>
              <li><strong className="text-[var(--text-primary)]">Reusable data infrastructure:</strong> publish stable route, stop, tile, history, and freshness contracts that other transit tools can consume.</li>
            </ul>
            <p>Some surfaces are public, some are in beta, and some remain research or validation tools. The same processed data model supports all of them without making every experimental feature part of the main map.</p>
          </Section>

          <Section id="data-model" title="A layered data model">
            <p>Atlas keeps several kinds of transit information separate because they answer different questions:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Schedule data</strong> describes what an agency publishes for planned service.</li>
              <li><strong className="text-[var(--text-primary)]">Processed metrics</strong> describe what Atlas derives from that schedule, such as headways, tiers, coverage, and route branches.</li>
              <li><strong className="text-[var(--text-primary)]">Provenance and quality</strong> describe the source, freshness, review state, and corrections attached to a result.</li>
              <li><strong className="text-[var(--text-primary)]">Historical data</strong> describes documented past schedule periods rather than pretending current data is historical.</li>
              <li><strong className="text-[var(--text-primary)]">Real-time data</strong>, where supported, describes observed vehicle or adherence information and is never silently mixed with schedule frequency.</li>
            </ul>
            <p>This separation is one of Atlas’s core design principles: a useful number is not automatically a trustworthy number unless its source, meaning, and time period are clear.</p>
          </Section>

          <Section id="data-products" title="Data products and research surfaces">
            <p>Different transit questions need different products. Atlas keeps these surfaces related but does not force them into one overloaded route card:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Frequency:</strong> current scheduled cadence, period filters, route variants, stop-level metrics, and map colouring.</li>
              <li><strong className="text-[var(--text-primary)]">Fares:</strong> base adult fare information derived from GTFS Fares V1 or V2 when available, with explicitly labelled manual fallbacks where a feed is incomplete.</li>
              <li><strong className="text-[var(--text-primary)]">History:</strong> selected agencies with usable archived GTFS periods, showing documented service changes without fabricating missing years.</li>
              <li><strong className="text-[var(--text-primary)]">On-demand service:</strong> GTFS-Flex and source-backed service areas represented separately from fixed-route frequency so booking-based service is not misread as a normal route.</li>
              <li><strong className="text-[var(--text-primary)]">Research:</strong> focused views for night service, frequent-service criteria, fares, transfers, system maps, and other questions that need source review before becoming general map features.</li>
            </ul>
            <p>Research outputs can become product features only after their definitions, coverage, and source quality are clear. This is why Atlas sometimes contains a capability in the data or code before exposing it in the primary navigation.</p>
          </Section>

          <Section id="data-flow" title="Data flow">
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
          </Section>

          <Section title="What Atlas reads from GTFS">
            <p>A GTFS feed is a group of related tables rather than one ready-made map. Atlas uses those tables together:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><code className="text-[var(--text-primary)]">routes</code> identifies services and their public route names;</li>
              <li><code className="text-[var(--text-primary)]">trips</code> identifies individual scheduled runs and directions;</li>
              <li><code className="text-[var(--text-primary)]">stop_times</code> supplies the scheduled arrivals and departures;</li>
              <li><code className="text-[var(--text-primary)]">stops</code> supplies names and coordinates; and</li>
              <li><code className="text-[var(--text-primary)]">calendar</code>, <code className="text-[var(--text-primary)]">calendar_dates</code>, and feed dates determine when trips operate.</li>
            </ul>
            <p>Shapes and route metadata describe where a service runs, but the frequency numbers come from scheduled departures. A visually long route is not automatically a frequent route.</p>
          </Section>

          <Section title="Choosing the active schedule">
            <p>Feeds commonly contain past, current, and future service at the same time. Atlas evaluates the feed’s calendar dates around the refresh date and selects the schedule period that is active for the map.</p>
            <p>It then separates departures by day type—weekday, Saturday, and Sunday—and by named time period. This prevents an expired schedule or a future seasonal timetable from being treated as today’s service.</p>
            <p>After publication, the agency’s source date and freshness state remain visible in Atlas so users can see when the underlying schedule was last checked.</p>
          </Section>

          <Section title="Routes, branches, and shapes">
            <p>A public route name can represent several patterns: branches, short turns, directions, destinations, or trips that only operate during part of the day. Atlas keeps those patterns distinct long enough to calculate meaningful service, then presents them through route and branch summaries.</p>
            <p>For map display, Atlas selects representative geometry for the active service patterns. For analysis, it avoids allowing a short branch or garage trip to distort the frequency of the main route.</p>
            <p>This is why the line shown on the map, the cadence shown on a route card, and the cadence used by a frequency filter can be related but not identical measurements.</p>
          </Section>

          <Section id="frequency" title="Frequency calculations">
            <p>Atlas calculates scheduled headways: the time between consecutive departures. It reads departure times from <code className="text-[var(--text-primary)]">stop_times</code> rather than trusting optional feed-level headway fields, which are often missing or inconsistent.</p>
            <p>Departures are grouped by route, direction, stop, day type, and service period. For a group of departures, Atlas sorts the consecutive gaps and uses the median gap as the typical scheduled headway.</p>
            <p>The median is intentionally resistant to outliers. One unusually long gap should not make an otherwise regular 10-minute service look like 30-minute service.</p>
            <p>Period calculations are kept inside their own time windows. Atlas does not silently borrow an all-day average to fill a period with sparse or missing service.</p>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-3">
              <p className="font-bold text-[var(--text-primary)]">Frequency bands</p>
              <p className="mt-1">The main Frequency control currently exposes service at or below 10, 15, 20, 30, and 60 minutes. Service slower than 60 minutes, or service that does not qualify for a sustained band, appears as infrequent in that surface.</p>
              <p className="mt-2">Beta also processes some rail service against additional 5- and 8-minute thresholds, and its separate Frequent Service research views use 15- and 30-minute criteria. Those are distinct from the main map’s general-purpose filter.</p>
            </div>
          </Section>

          <Section title="Sustained service and long gaps">
            <p>A median alone can hide an important gap. For example, departures might be every 30 minutes during a period except for one three-hour hole. Atlas keeps additional coverage and longest-gap signals so a route can be marked as uneven instead of presenting the median as the whole story.</p>
            <p>Frequency tiers therefore require sustained service across the relevant window. A route does not qualify for a fast tier simply because it has a short burst of frequent trips at one edge of the period.</p>
            <p>When a route operates only during part of the day, Atlas records that absence as an empty period rather than copying its operating-period value into the rest of the day.</p>
          </Section>

          <Section id="service-classification" title="Service classification">
            <p>Frequency and regularity are separate properties. A route can run every 30 minutes and still be irregular if it only operates for a short burst or has too few repeated departures to establish a sustained pattern.</p>
            <dl className="space-y-2">
              <div><dt className="font-bold text-[var(--text-primary)]">Regular</dt><dd>Service covers the normal analysis window. It may be frequent or infrequent.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Time-limited</dt><dd>Predictable service operates during part of the day and has enough repeated departures for a meaningful frequency estimate.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Irregular</dt><dd>Exceptional, very short, one-sided, or otherwise unsustained service that should not be presented as a normal route cadence.</dd></div>
            </dl>
            <p>The default irregular-service filter hides irregular patterns while keeping predictable time-limited service visible. Periods outside a time-limited route’s operation remain empty rather than inheriting an all-day value.</p>
          </Section>

          <Section id="map-architecture" title="Map architecture">
            <p>The frontend is a React application using MapLibre for map interaction and rendering. Route geometry is distributed in vector tiles for broad map views, while agency detail and stop indexes are loaded as smaller JSON artifacts when needed.</p>
            <p>At a high level, the browser combines three kinds of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>agency metadata, coverage, source dates, and quality notices;</li>
              <li>route geometry and serialized frequency properties; and</li>
              <li>stop coordinates and route-specific service metrics.</li>
            </ul>
            <p>This separation keeps the initial map responsive and lets Atlas update schedule data independently from the application interface.</p>
          </Section>

          <Section id="corrections" title="Data correction and provenance">
            <p>Atlas does not treat every source feed as ready for publication. Corrections happen at different layers, and the layer matters:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Parsing repairs</strong> address malformed source structures, such as broken or interleaved route geometry, only when the repair is unambiguous and validated.</li>
              <li><strong className="text-[var(--text-primary)]">Normalization rules</strong> reconcile feed conventions, synthesize usable directions, remove duplicate patterns, and separate branches or short turns that would otherwise distort analysis.</li>
              <li><strong className="text-[var(--text-primary)]">Rider-facing corrections</strong> remove known non-revenue trips, placeholder destinations, duplicate source service, or other values that do not represent what passengers can use.</li>
              <li><strong className="text-[var(--text-primary)]">Agency-specific overrides</strong> handle a documented feed problem that cannot safely become a global rule. These are scoped to the affected agency, route, shape, or source snapshot.</li>
              <li><strong className="text-[var(--text-primary)]">Quality annotations</strong> preserve problems that should not be silently “fixed,” such as missing shapes, stale feeds, route-frequency mismatches, or unresolved geometry.</li>
            </ul>
            <p>Every correction should have a reason, a narrow scope, and a validation check. A general rule is only preferred when it has been tested against unrelated agencies; otherwise Atlas uses a targeted exception rather than risking a larger silent change.</p>
            <p>Corrections are tied to the source data that required them. When a new upstream feed arrives, Atlas rechecks whether the correction is still needed instead of treating the old exception as permanent truth.</p>
            <p>Where a correction affects interpretation, Atlas can show a public note on the relevant agency or route. The goal is not to make imperfect data look perfect; it is to make the processing decision visible and bounded.</p>
          </Section>

          <Section title="Why values can differ across the interface">
            <p>Atlas exposes several legitimate views of service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Display cadence</strong> describes the route or destination a rider is looking at.</li>
              <li><strong className="text-[var(--text-primary)]">Filter cadence</strong> determines whether a route qualifies for a selected frequency threshold.</li>
              <li><strong className="text-[var(--text-primary)]">Stop cadence</strong> describes service at a specific boarding stop.</li>
              <li><strong className="text-[var(--text-primary)]">Shared-section cadence</strong> describes the combined service where branches overlap.</li>
            </ul>
            <p>These projections answer different questions. A route can qualify because one useful section is frequent while its terminal service is slower; Atlas labels the surfaces rather than pretending there is one universal number.</p>
          </Section>

          <Section title="Public outputs">
            <p>After processing, Atlas publishes a set of read-only artifacts for the frontend:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>route geometry with serialized service metrics;</li>
              <li>a lightweight stop index for searching and stop-specific views;</li>
              <li>vector tiles for efficient map rendering; and</li>
              <li>agency metadata describing coverage, freshness, sources, and quality status.</li>
            </ul>
            <p>The artifacts contain processed public transit information. They do not contain user accounts, private analytics records, feed credentials, or the raw maintainer workflow.</p>
          </Section>

          <Section id="quality" title="Quality and limitations">
            <p>Atlas checks feeds for structural and service-data problems, including missing or unusual geometry, schedule inconsistencies, stale sources, and route-frequency anomalies. Some known source problems are corrected or annotated before publication.</p>
            <p>Feed-specific corrections are kept separate from the general methodology so a fix for one agency does not silently change every agency’s results.</p>
            <p>Atlas is schedule analysis, not real-time observation. It does not know whether a vehicle is delayed, cancelled, short-turned, crowded, or accessible unless an explicitly labelled feature provides that information.</p>
            <p>Source feeds can be delayed, incomplete, discontinued, or incorrect. For live alerts, accessibility information, trip planning, and emergency instructions, use the relevant transit agency’s official resources.</p>
          </Section>

          <Section id="validation" title="Validation and audit work">
            <p>Atlas uses more than a parser-success check. A feed can be valid GTFS and still produce a misleading map, so validation happens at several levels:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li><strong className="text-[var(--text-primary)]">Feed validation:</strong> confirm that required tables, dates, routes, stops, trips, and shapes can be read.</li>
              <li><strong className="text-[var(--text-primary)]">Processing validation:</strong> check that normalization, direction handling, branch selection, and frequency calculations produce coherent outputs.</li>
              <li><strong className="text-[var(--text-primary)]">Cross-agency checks:</strong> compare the shared pipeline across different feed structures, modes, and service patterns.</li>
              <li><strong className="text-[var(--text-primary)]">Source verification:</strong> use official agency pages and published documents for fares, transfers, service areas, and other facts that GTFS alone cannot establish.</li>
              <li><strong className="text-[var(--text-primary)]">Rendered verification:</strong> check that published artifacts, map layers, route cards, filters, links, and deployment modes agree with the processed data.</li>
            </ol>
            <p>When Atlas cannot establish a fact confidently, it keeps the uncertainty visible, narrows the claim, or leaves the feature out rather than filling the gap with an inference.</p>
          </Section>

          <Section id="glossary" title="Glossary">
            <p><strong className="text-[var(--text-primary)]">GTFS:</strong> A standard set of files describing transit routes, stops, trips, calendars, and shapes.</p>
            <p><strong className="text-[var(--text-primary)]">Headway:</strong> The time between consecutive scheduled departures.</p>
            <p><strong className="text-[var(--text-primary)]">Service period:</strong> A named time window such as AM Peak, Midday, PM Peak, evening, or overnight.</p>
            <p><strong className="text-[var(--text-primary)]">Frequency tier:</strong> A broad band used to colour and filter service on the map.</p>
            <p><strong className="text-[var(--text-primary)]">PMTiles:</strong> A single archive format that lets the map request only the vector-tile regions it needs.</p>
          </Section>

          <Section title="Technical questions and feedback">
            <p>Questions about the methodology, a suspected data problem, or a transit agency’s coverage are welcome. This public page intentionally omits credentials, deployment configuration, and maintainer runbooks.</p>
          </Section>

          <Section title="Privacy">
            <p>You can browse Atlas without an account. Read the <a className="text-[var(--accent)] hover:underline" href="/privacy">Privacy Policy</a> to learn about analytics and browser preferences.</p>
            <a
              href="mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback"
              className="inline-flex items-center gap-2 font-bold text-[var(--accent)] hover:underline"
            >
              Contact us with a question or correction <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Section>

          <footer className="border-t border-[var(--border-primary)] pt-5 text-sm text-[var(--text-dim)]">
            <a className="text-[var(--accent)] hover:underline" href="/terms">Terms of Service</a>
            <span className="mx-2">·</span>
            <a className="text-[var(--accent)] hover:underline" href="/privacy">Privacy Policy</a>
          </footer>
          </article>
        </div>
      </div>
    </main>
  );
}
