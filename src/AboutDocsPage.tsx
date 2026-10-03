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
      <div className="max-w-2xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Atlas
        </a>

        <article className="mt-10 space-y-8">
          <header>
            <h1 className="text-3xl font-black tracking-tight">Documentation</h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-dim)]">
              A technical overview of Atlas’s data, methodology, and map architecture.
            </p>
          </header>

          <Section title="What Atlas is">
            <p>Atlas is a client-side transit analysis application for comparing scheduled service across agencies and cities.</p>
            <p>It turns published transit schedules into map layers, route summaries, stop-level frequency estimates, and network comparisons.</p>
          </Section>

          <Section title="Data pipeline">
            <p>Atlas primarily ingests General Transit Feed Specification (GTFS) schedule data published by transit agencies and transit data providers.</p>
            <p>The processing pipeline validates and normalizes routes, stops, calendars, shapes, and service periods before producing browser-readable transit artifacts.</p>
            <p>The frontend loads those published artifacts and renders them with MapLibre. The application does not require an account or a user database.</p>
          </Section>

          <Section title="Frequency methodology">
            <p>Atlas calculates scheduled headways—the time between trips—using trips, stop times, route patterns, calendars, and service periods in the source feed.</p>
            <p>Results are grouped into frequency bands to make network-level comparisons easier. They describe scheduled service, not observed vehicle movement or a guarantee of what will arrive.</p>
            <p>Different service periods can produce different results. A route’s displayed frequency may therefore change when you switch between all-day, weekday, evening, or other period views.</p>
          </Section>

          <Section title="Map and application architecture">
            <p>The map uses MapLibre for interaction and vector-tile rendering. Route geometry, stop data, and agency metadata are loaded separately so broad map views can remain lightweight.</p>
            <p>Atlas is deployed as a static React application. Public transit artifacts are delivered from object storage, while the hosting platform serves the application and lightweight privacy-region and analytics integrations.</p>
          </Section>

          <Section title="Validation and limitations">
            <p>Atlas checks feeds for structural and service-data problems, including missing or unusual geometry, schedule inconsistencies, stale sources, and route-frequency anomalies. Some known source problems are corrected or annotated before publication.</p>
            <p>Feeds can still be delayed, incomplete, discontinued, or incorrect. Atlas does not replace official alerts, accessibility information, trip-planning results, or emergency instructions from a transit agency.</p>
          </Section>

          <Section title="Technical questions and feedback">
            <p>Questions about the methodology, a suspected data problem, or a transit agency’s coverage are welcome.</p>
            <p>Atlas’s internal engineering notes and research records are maintained separately from this public overview.</p>
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
    </main>
  );
}
