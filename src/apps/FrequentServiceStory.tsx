import { ArrowDown, ArrowRight, ExternalLink, MapPinned } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { frequentServiceStoryExamples, frequentServiceStoryStats, type FrequentServiceStoryExample } from '../data/frequentServiceStory';

interface Props {
  onExploreMap: () => void;
}

const toneStyles = {
  orange: { accent: '#f97316', soft: 'rgba(249, 115, 22, 0.12)' },
  blue: { accent: '#38bdf8', soft: 'rgba(56, 189, 248, 0.12)' },
  green: { accent: '#34d399', soft: 'rgba(52, 211, 153, 0.12)' },
  purple: { accent: '#c084fc', soft: 'rgba(192, 132, 252, 0.12)' },
} as const;

function StoryExample({ example }: { example: FrequentServiceStoryExample }) {
  const tone = toneStyles[example.tone];
  return (
    <article
      className="rounded-[1.75rem] border border-[var(--border-primary)] overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${tone.soft}, transparent 60%), var(--bg-panel)` }}
    >
      <div className="h-1" style={{ backgroundColor: tone.accent }} />
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] font-black" style={{ color: tone.accent }}>
              {example.city} · {example.agency}
            </p>
            <h3 className="mt-3 text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)]">{example.headline}</h3>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--border-primary)] px-2.5 py-1 text-[0.65rem] font-bold text-[var(--text-muted)]">
            {example.scale === 'large-system' ? 'Large system' : example.scale === 'smaller-system' ? 'Smaller system' : 'Counterexample'}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{example.summary}</p>
        <ul className="mt-5 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
          {example.details.map(detail => (
            <li key={detail} className="rounded-xl bg-[var(--bg-stat)] px-3 py-2 leading-5">{detail}</li>
          ))}
        </ul>
        <a
          href={example.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] underline decoration-[var(--border-primary)] underline-offset-4 hover:decoration-current"
        >
          {example.sourceLabel}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export default function FrequentServiceStory({ onExploreMap }: Props) {
  const maxBar = Math.max(...frequentServiceStoryStats.thresholdBars.map(bar => bar.agencies));

  function exploreMap() {
    trackEvent('frequent_service_story_map_opened');
    onExploreMap();
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)]">
      <article className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pt-20">
        <header className="mx-auto max-w-4xl text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Atlas research</p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[0.98]">What does “frequent” actually mean?</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-8 text-[var(--text-muted)]">
            A transit map can look full of lines and still leave you waiting. We reviewed 500 agencies to see how they describe the service people can actually rely on.
          </p>
          <a href="#story" className="mt-9 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">
            Read the research <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </header>

        <div id="story" className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <section aria-labelledby="why-heading" className="grid gap-8 sm:grid-cols-[0.8fr_1.2fr] sm:items-start">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] font-black text-[var(--text-dim)]">01 / The problem</p>
            <div>
              <h2 id="why-heading" className="text-3xl sm:text-4xl font-black tracking-tight">A line on a map is not a promise.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Agencies use words like frequent, rapid, trunk, and primary to describe the routes that hold a network together. But those labels can mean a strict 10-minute promise, a 15-minute corridor, a service class with different dayparts, or simply a planning goal.
              </p>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                So we looked at the official maps, service pages, guidelines, and planning documents—not to replace each agency’s definition, but to understand the landscape Atlas is trying to compare.
              </p>
            </div>
          </section>

          <section aria-labelledby="examples-heading">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] font-black text-[var(--text-dim)]">02 / The examples</p>
              <h2 id="examples-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">There is no single “frequent.”</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">Here is what that looks like across large systems, smaller cities, and one important absence.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {frequentServiceStoryExamples.map(example => <StoryExample key={example.id} example={example} />)}
            </div>
          </section>

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] font-black text-[var(--text-dim)]">03 / The pattern</p>
              <h2 id="chart-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">15 minutes is common. It is not universal.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Of the 500 agencies reviewed, 91 published a named frequent or high-frequency tier with a numeric threshold. Fifteen minutes was the most common value, followed by 30 and 10 minutes.
              </p>
            </div>
            <div className="mt-10" role="img" aria-label="Bar chart showing the number of agencies publishing each named numeric frequent-service threshold">
              <div className="space-y-4">
                {frequentServiceStoryStats.thresholdBars.map(bar => (
                  <div key={bar.minutes} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="font-black text-[var(--text-primary)]">{bar.minutes} min</span>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(bar.agencies / maxBar) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-[var(--text-muted)]">{bar.agencies}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Agencies publishing this threshold. An agency can appear in more than one bar when it publishes multiple tiers or periods.</p>
            </div>
          </section>

          <section aria-labelledby="more-heading" className="grid gap-8 sm:grid-cols-[0.8fr_1.2fr] sm:items-start">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] font-black text-[var(--text-dim)]">04 / The missing context</p>
            <div>
              <h2 id="more-heading" className="text-3xl sm:text-4xl font-black tracking-tight">The number is only the beginning.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">A frequency threshold is attached to a span, a set of days, and a geography. It may describe a route, a corridor, a network, or a product that combines modes. A 15-minute route that stops at 6pm is a different promise from a 15-minute corridor that runs into the evening.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {['Headway', 'Service span', 'Geography'].map((label, index) => (
                  <div key={label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
                    <span className="text-xs font-black text-[var(--accent)]">0{index + 1}</span>
                    <p className="mt-8 text-sm font-black">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="atlas-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.2em] font-black text-[var(--text-dim)]">05 / Your city</p>
                <h2 id="atlas-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Now find your own network.</h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">The research explains the categories. Atlas lets you apply one consistent test to the routes around you. Search for a city, compare 15- and 30-minute service, and see where the useful network actually holds together.</p>
              </div>
              <button type="button" onClick={exploreMap} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-black text-[var(--bg-app)] hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                Find your city
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <footer className="border-t border-[var(--border-primary)] pt-8 text-xs leading-6 text-[var(--text-dim)]">
            <p><strong className="text-[var(--text-muted)]">Method.</strong> Atlas reviewed official agency system maps, frequent-network pages, service guidelines, planning documents, and route-service pages. “No definition found” means no named rider-facing definition was located within the review boundary; it does not mean the agency has no frequent service.</p>
            <p className="mt-3">This research describes Atlas’s 500-agency sample. It does not change Atlas’s production frequency definitions.</p>
          </footer>
        </div>
      </article>
    </div>
  );
}
