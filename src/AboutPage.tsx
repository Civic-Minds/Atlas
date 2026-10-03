import React from 'react';
import { ArrowRight, BookOpen, Mail, Map } from 'lucide-react';
import { FEATURE_ROUTES } from '../shared/config';

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)] px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 text-sm font-black">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg">
              <Map className="h-4 w-4" />
            </span>
            <span>Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span></span>
          </a>
          <a href="/" className="text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">Back to map</a>
        </header>

        <section className="max-w-3xl py-20 sm:py-28">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--accent)]">About Atlas</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">A clearer way to explore transit.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
            Atlas is a map for understanding transit networks: where routes go, how often they run, and how service changes across the day.
          </p>
        </section>

        <section className="grid gap-5 pb-16 md:grid-cols-3">
          <article className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 shadow-xl">
            <Map className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="mt-6 text-xl font-black">Explore the network</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Compare routes, agencies, modes, and service periods on one map without losing the surrounding context.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 shadow-xl">
            <BookOpen className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="mt-6 text-xl font-black">Read the evidence</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Atlas uses published agency data and keeps research, schedule interpretation, and product behaviour distinct.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 shadow-xl">
            <Mail className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="mt-6 text-xl font-black">Help improve it</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Spot something wrong or have an idea? Send feedback and include the map link where you found it.</p>
            <a className="mt-5 inline-flex items-center gap-2 text-sm font-bold" href="mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback">Contact Atlas <ArrowRight className="h-4 w-4" /></a>
          </article>
        </section>

        <section className="max-w-2xl border-t border-[var(--border-primary)] py-10">
          <h2 className="text-2xl font-black">Keep exploring</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Use the map for the network in front of you, or visit Research for source-backed comparisons of service patterns.</p>
          <a href={FEATURE_ROUTES.research} className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2 text-sm font-bold shadow-lg hover:border-[var(--accent)]">Visit Research <ArrowRight className="h-4 w-4" /></a>
        </section>

        <footer className="flex gap-3 pb-10 text-xs text-[var(--text-dim)]">
          <a href="/terms" className="hover:text-[var(--accent)] hover:underline">Terms</a>
          <span>·</span>
          <a href="/privacy" className="hover:text-[var(--accent)] hover:underline">Privacy policy</a>
          <span>·</span>
          <span>© 2026 Civic Minds.</span>
        </footer>
      </div>
    </main>
  );
}
