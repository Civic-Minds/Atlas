import { ArrowLeft, ArrowRight, BookOpen, Clock3, FlaskConical, Map } from 'lucide-react';
import SiteFooter from './components/SiteFooter';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to the map
        </a>

        <article className="mt-12">
          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">Atlas</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-6xl">Find the transit service that actually runs.</h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-muted)]">
                Atlas turns published schedules into a map you can explore by frequency, time of day, agency, and place.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                <a href="/" className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-black text-[var(--bg-app)] hover:opacity-80">
                  Open the map <ArrowRight className="h-4 w-4" />
                </a>
                <a href="/research" className="inline-flex h-10 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">
                  Explore research
                </a>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-dim)]">Ask Atlas</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 rounded-2xl bg-[var(--bg-btn)] p-3">
                  <Map className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-sm font-bold">Where can I find frequent service?</span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-[var(--bg-btn)] p-3">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-sm font-bold">What still runs overnight?</span>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-[var(--bg-btn)] p-3">
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-sm font-bold">How do two networks compare?</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-16 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5">
              <Map className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-5 text-base font-black">See the network</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Compare scheduled service across agencies, cities, and regions.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5">
              <Clock3 className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-5 text-base font-black">See when it runs</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Switch between daytime, late, overnight, and other service periods.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5">
              <BookOpen className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="mt-5 text-base font-black">Know what it means</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Read the sources, definitions, and limits behind each view.</p>
            </div>
          </section>

          <section className="mt-16 max-w-2xl border-t border-[var(--border-primary)] pt-8">
            <h2 className="text-xl font-black">Built for looking closer</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
              Atlas is for riders, planners, researchers, and advocates who want to understand service beyond a single trip. It uses published agency schedules to make patterns visible, while keeping live alerts and official trip planning with the agencies that provide them.
            </p>
            <a href="/about/docs" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
              Read how Atlas works <ArrowRight className="h-4 w-4" />
            </a>
          </section>
        </article>

        <div className="mt-16">
          <SiteFooter />
        </div>
      </div>
    </main>
  );
}
