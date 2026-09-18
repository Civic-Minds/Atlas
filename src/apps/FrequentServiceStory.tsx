import { useState } from 'react';
import { ArrowDown, ArrowRight, ExternalLink, MapPinned } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { frequentServiceStoryExamples, frequentServiceStoryStats, type FrequentServiceStoryExample } from '../data/frequentServiceStory';

interface Props {
  onExploreMap: () => void;
}

function StoryExample({ example }: { example: FrequentServiceStoryExample }) {
  const detailLabels = ['When', 'Where', 'What the agency calls it'];

  return (
    <article className="mt-8 border-t border-[var(--border-primary)] pt-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xl font-black tracking-tight text-[var(--text-primary)]">{example.city}</p>
        <p className="text-sm text-[var(--text-muted)]">{example.agency}</p>
      </div>
      <h3 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">{example.headline}</h3>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-muted)]">{example.summary}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {example.details.map((detail, index) => (
          <div key={detail} className="rounded-xl bg-[var(--bg-stat)] p-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--text-dim)]">{detailLabels[index] ?? 'Published detail'}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function FrequentServiceStory({ onExploreMap }: Props) {
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [selectedExampleId, setSelectedExampleId] = useState('translink-vancouver');
  const maxBar = Math.max(...frequentServiceStoryStats.headwayBars.map(bar => bar.agencies));
  const selectedBar = frequentServiceStoryStats.headwayBars.find(bar => bar.minutes === selectedMinutes);
  const selectedExamples = frequentServiceStoryExamples.filter(example => example.thresholdMinutes.includes(selectedMinutes));
  const selectedExample = selectedExamples.find(example => example.id === selectedExampleId) ?? selectedExamples[0];

  function selectMinutes(minutes: number) {
    const examples = frequentServiceStoryExamples.filter(example => example.thresholdMinutes.includes(minutes));
    setSelectedMinutes(minutes);
    setSelectedExampleId(examples[0]?.id ?? '');
  }

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
          <section aria-labelledby="why-heading" className="mx-auto w-full max-w-[48rem]">
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

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Explore the sample</p>
              <h2 id="chart-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">There is no single “frequent.”</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Pick a published threshold to see how agencies turn that number into a real service promise. The chart covers the 87 agencies that explicitly named a frequent or high-frequency tier with a numeric threshold.
              </p>
            </div>
            <div className="mt-10" aria-label="Interactive chart showing the number of agencies by the selected published frequent-service threshold">
              <div className="space-y-4">
                {frequentServiceStoryStats.headwayBars.map(bar => (
                  <button
                    key={bar.minutes}
                    type="button"
                    aria-pressed={selectedMinutes === bar.minutes}
                    aria-label={`Show examples for ${bar.minutes}-minute service (${bar.agencies} agencies)`}
                    onClick={() => selectMinutes(bar.minutes)}
                    title={`Show examples for ${bar.minutes}-minute service (${bar.agencies} agencies)`}
                    className="grid w-full grid-cols-[4.5rem_1fr_3rem] items-center gap-3 rounded-lg text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
                  >
                    <span className="font-black text-[var(--text-primary)]">{bar.minutes} min</span>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]">
                      <div className="h-full rounded-full transition-[width,background-color]" style={{ width: `${(bar.agencies / maxBar) * 100}%`, backgroundColor: selectedMinutes === bar.minutes ? 'var(--accent)' : 'var(--text-muted)' }} />
                    </div>
                    <span className="text-right tabular-nums text-[var(--text-muted)]">{bar.agencies}</span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Each agency appears once. Where the catalog identifies a primary map-facing threshold, that is used; otherwise the slowest period in the named tier is used. Select a bar to see illustrative examples.</p>
            </div>
            <div className="mt-10 border-t border-[var(--border-primary)] pt-8" aria-live="polite">
              <p className="text-sm font-bold text-[var(--text-muted)]">{selectedBar?.agencies} agencies · selected published threshold: {selectedMinutes} minutes</p>
              <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
                The same number can describe a whole network, a corridor, only part of the day, or a tier that drops to a slower service outside peak hours.
              </p>
              {selectedExamples.length > 0 ? (
                <>
                  <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label={`${selectedMinutes}-minute examples`}>
                    {selectedExamples.map(example => (
                      <button
                        key={example.id}
                        type="button"
                        role="tab"
                        aria-selected={selectedExample?.id === example.id}
                        onClick={() => setSelectedExampleId(example.id)}
                        className={`rounded-full border px-3 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${selectedExample?.id === example.id ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-app)]' : 'border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]'}`}
                      >
                        {example.city}
                      </button>
                    ))}
                  </div>
                  {selectedExample && <StoryExample example={selectedExample} />}
                </>
              ) : (
                <p className="mt-6 text-sm leading-6 text-[var(--text-muted)]">No featured example in this story uses this threshold.</p>
              )}
            </div>
          </section>

          <section aria-labelledby="more-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="more-heading" className="text-3xl sm:text-4xl font-black tracking-tight">The number is only the beginning.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">A frequency threshold is attached to a span, a set of days, and a geography. It may describe a route, a corridor, a network, or a product that combines modes. A 15-minute route that stops at 6pm is a different promise from a 15-minute corridor that runs into the evening. That is why we track three things together: headway, service span, and geography.</p>
            </div>
          </section>

          <section aria-labelledby="atlas-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <h2 id="atlas-heading" className="text-3xl sm:text-4xl font-black tracking-tight">Now find your own network.</h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">The research explains the categories. Atlas lets you apply one consistent test to the routes around you. Search for a city, compare 15- and 30-minute service, and see where the useful network actually holds together.</p>
              </div>
              <button type="button" onClick={exploreMap} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-black text-[var(--bg-app)] hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                Find your city
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <footer className="border-t border-[var(--border-primary)] pt-10">
            <div className="w-full max-w-[48rem]">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">How we did this</h2>
              <div className="mt-5 space-y-5 text-sm sm:text-base leading-7 sm:leading-8 text-[var(--text-muted)]">
                <p><strong className="text-[var(--text-primary)]">Sample.</strong> We reviewed {frequentServiceStoryStats.agenciesReviewed} agencies between {frequentServiceStoryStats.reviewedAt}: {frequentServiceStoryStats.countryCounts.map(item => `${item.agencies} in ${item.country}`).join(', ')}. Of those, {frequentServiceStoryStats.categoryCounts.numericDefinition} published at least one numeric frequency tier, while {frequentServiceStoryStats.categoryCounts.noDefinitionFound} had no named definition located in the reviewed material.</p>
                <p><strong className="text-[var(--text-primary)]">Review boundary.</strong> We checked official system maps, frequent-network pages, service guidelines, planning documents, and route-service pages. We recorded what the agency publishes—not what Atlas thinks the word “frequent” should mean.</p>
                <p><strong className="text-[var(--text-primary)]">What counted.</strong> A numeric definition required an agency tier with a published frequency value. A qualitative definition used a named frequent or high-frequency service without a number. “No definition found” means we did not locate a named rider-facing definition within the reviewed material; it does not mean the agency has no frequent service.</p>
                <p><strong className="text-[var(--text-primary)]">How we handled numbers.</strong> We kept published ranges and dayparts intact. Agencies are counted once in the chart. When a source identifies a primary map-facing threshold, that takes precedence over a slower product-specific period; otherwise, the slowest period in the named tier is used.</p>
                <p><strong className="text-[var(--text-primary)]">Limitations.</strong> This is a source-backed sample, not an exhaustive census of every transit agency or a universal definition of frequent service. It describes the research sample and does not change Atlas’s production frequency definitions.</p>
              </div>
            </div>
            <div className="mt-10 border-t border-[var(--border-primary)] pt-8">
              <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)]">Sources for the featured examples</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">These are the official materials for the narrative examples on this page—not a complete bibliography of the 500-agency review. The chart and sample totals come from the full research catalog described in the Method.</p>
              <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {frequentServiceStoryExamples.map(example => (
                  <li key={example.id}>
                    <a
                      href={example.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--border-primary)] underline-offset-4 hover:decoration-current"
                    >
                      {example.city} — {example.sourceLabel}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
