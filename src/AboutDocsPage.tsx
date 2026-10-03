import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
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
              <a className="block text-[var(--accent)] hover:underline" href="#data-flow">Data flow</a>
              <a className="block text-[var(--accent)] hover:underline" href="#frequency">Frequency calculations</a>
              <a className="block text-[var(--accent)] hover:underline" href="#service-classification">Service classification</a>
              <a className="block text-[var(--accent)] hover:underline" href="#map-architecture">Map architecture</a>
              <a className="block text-[var(--accent)] hover:underline" href="#quality">Quality and limitations</a>
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

          <Section title="Data flow">
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

          <Section title="Frequency calculations">
            <p id="frequency">Atlas calculates scheduled headways: the time between consecutive departures. It reads departure times from <code className="text-[var(--text-primary)]">stop_times</code> rather than trusting optional feed-level headway fields, which are often missing or inconsistent.</p>
            <p>Departures are grouped by route, direction, stop, day type, and service period. For a group of departures, Atlas sorts the consecutive gaps and uses the median gap as the typical scheduled headway.</p>
            <p>The median is intentionally resistant to outliers. One unusually long gap should not make an otherwise regular 10-minute service look like 30-minute service.</p>
            <p>Period calculations are kept inside their own time windows. Atlas does not silently borrow an all-day average to fill a period with sparse or missing service.</p>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-3">
              <p className="font-bold text-[var(--text-primary)]">Frequency bands</p>
              <p className="mt-1">The map currently distinguishes service at or below 10, 15, 20, 30, and 60 minutes. Service slower than 60 minutes, or service that does not qualify for a sustained band, is treated as infrequent.</p>
            </div>
          </Section>

          <Section title="Service classification">
            <p id="service-classification">Frequency and regularity are separate properties. A route can run every 30 minutes and still be irregular if it only operates for a short burst or has too few repeated departures to establish a sustained pattern.</p>
            <dl className="space-y-2">
              <div><dt className="font-bold text-[var(--text-primary)]">Regular</dt><dd>Service covers the normal analysis window. It may be frequent or infrequent.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Time-limited</dt><dd>Predictable service operates during part of the day and has enough repeated departures for a meaningful frequency estimate.</dd></div>
              <div><dt className="font-bold text-[var(--text-primary)]">Irregular</dt><dd>Exceptional, very short, one-sided, or otherwise unsustained service that should not be presented as a normal route cadence.</dd></div>
            </dl>
            <p>The default irregular-service filter hides irregular patterns while keeping predictable time-limited service visible. Periods outside a time-limited route’s operation remain empty rather than inheriting an all-day value.</p>
          </Section>

          <Section title="Map architecture">
            <p id="map-architecture">The frontend is a React application using MapLibre for map interaction and rendering. Route geometry is distributed in vector tiles for broad map views, while agency detail and stop indexes are loaded as smaller JSON artifacts when needed.</p>
            <p>At a high level, the browser combines three kinds of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>agency metadata, coverage, source dates, and quality notices;</li>
              <li>route geometry and serialized frequency properties; and</li>
              <li>stop coordinates and route-specific service metrics.</li>
            </ul>
            <p>This separation keeps the initial map responsive and lets Atlas update schedule data independently from the application interface.</p>
          </Section>

          <Section title="Quality and limitations">
            <p id="quality">Atlas checks feeds for structural and service-data problems, including missing or unusual geometry, schedule inconsistencies, stale sources, and route-frequency anomalies. Some known source problems are corrected or annotated before publication.</p>
            <p>Feed-specific corrections are kept separate from the general methodology so a fix for one agency does not silently change every agency’s results.</p>
            <p>Atlas is schedule analysis, not real-time observation. It does not know whether a vehicle is delayed, cancelled, short-turned, crowded, or accessible unless an explicitly labelled feature provides that information.</p>
            <p>Source feeds can be delayed, incomplete, discontinued, or incorrect. For live alerts, accessibility information, trip planning, and emergency instructions, use the relevant transit agency’s official resources.</p>
          </Section>

          <Section title="Glossary">
            <p id="glossary"><strong className="text-[var(--text-primary)]">GTFS:</strong> A standard set of files describing transit routes, stops, trips, calendars, and shapes.</p>
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
