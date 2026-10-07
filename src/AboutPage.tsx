import { ArrowLeft, BookOpen, FlaskConical, Map } from 'lucide-react';
import SiteFooter from './components/SiteFooter';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Atlas
        </a>

        <article className="mt-12 max-w-3xl space-y-10">
          <header>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">About Atlas</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">A clearer way to understand transit service.</h1>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
              Atlas turns published transit schedules into maps and comparisons that make frequency, coverage, service hours, and change easier to see.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
              <Map className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-4 text-sm font-black">Map service</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-muted)]">Compare scheduled service across agencies and cities.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
              <FlaskConical className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-4 text-sm font-black">Research patterns</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-muted)]">Explore specialised views for overnight and frequent service.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
              <BookOpen className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-4 text-sm font-black">Show the limits</h2>
              <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-muted)]">Keep source freshness, uncertainty, and methodology visible.</p>
            </div>
          </section>

          <section className="space-y-3 text-sm leading-7 text-[var(--text-muted)]">
            <h2 className="text-lg font-black text-[var(--text-primary)]">What Atlas is for</h2>
            <p>Atlas helps riders, planners, researchers, and advocates see where transit is frequent, when it runs, and how networks differ.</p>
            <p>It is built from published agency schedules. Atlas does not replace an agency’s live alerts, trip planner, or official service notices.</p>
          </section>

          <div className="flex flex-wrap gap-2">
            <a href="/research" className="inline-flex h-9 items-center rounded-full border border-[var(--accent-border)] px-4 text-xs font-bold text-[var(--accent)] hover:bg-[var(--bg-btn-hover)]">Explore research →</a>
            <a href="/about/docs" className="inline-flex h-9 items-center rounded-full border border-[var(--border-primary)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">Read documentation →</a>
          </div>
        </article>

        <div className="mt-16">
          <SiteFooter />
        </div>
      </div>
    </main>
  );
}
