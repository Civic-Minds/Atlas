import React from 'react';
import { ArrowRight, BookOpen, Moon, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../shared/config';

const cards = [
  {
    href: FEATURE_ROUTES.frequentService.story,
    label: 'Frequent Service',
    description: 'A source-backed look at what frequent service means across North American transit networks.',
    action: 'Read the research story',
    icon: <Zap className="h-5 w-5" />,
  },
  {
    href: FEATURE_ROUTES.frequentService.map,
    label: 'Frequent Service map',
    description: 'Compare 15- and 30-minute service across agencies, modes, days, and time spans.',
    action: 'Explore the map',
    icon: <Zap className="h-5 w-5" />,
  },
  {
    href: '/apps/night',
    label: 'Night Service',
    description: 'Explore agencies and routes with sustained overnight service.',
    action: 'Explore Night Service',
    icon: <Moon className="h-5 w-5" />,
  },
];

export default function ResearchPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)] px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 text-sm font-black">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg">
              <BookOpen className="h-4 w-4" />
            </span>
            <span>Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span></span>
          </a>
          <div className="flex items-center gap-4 text-sm font-bold text-[var(--text-muted)]">
            <a href={FEATURE_ROUTES.about} className="hover:text-[var(--text-primary)]">About Atlas</a>
            <a href="/" className="hover:text-[var(--text-primary)]">Back to map</a>
          </div>
        </header>

        <section className="max-w-3xl py-20 sm:py-28">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--accent)]">Atlas Research</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">How transit works in the places we study.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
            Read the evidence behind Atlas’s service categories, then explore the networks and routes that make the patterns visible.
          </p>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-3" aria-label="Research topics">
          {cards.map(card => (
            <a key={card.href} href={card.href} className="group flex min-h-64 flex-col rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 shadow-xl transition-transform hover:-translate-y-1">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--bg-active)] text-[var(--accent)]">{card.icon}</span>
              <h2 className="mt-8 text-xl font-black">{card.label}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-[var(--text-muted)]">{card.description}</p>
              <span className="mt-6 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                {card.action}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
