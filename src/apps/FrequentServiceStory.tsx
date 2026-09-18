import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, MapPinned } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { frequentServiceStoryExamples, frequentServiceStoryStats, type FrequentServiceStoryExample } from '../data/frequentServiceStory';
import FrequentServiceStoryMap from '../components/FrequentServiceStoryMap';
import type { Agency } from '../App';

interface Props {
  onExploreMap: () => void;
  agencies: Agency[];
}

function StoryExample({ example }: { example: FrequentServiceStoryExample }) {
  return (
    <article className="mt-8 border-t border-[var(--border-primary)] pt-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xl font-black tracking-tight text-[var(--text-primary)]">{example.city}</p>
        <p className="text-sm text-[var(--text-muted)]">{example.agency}</p>
      </div>
      <h3 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">{example.headline}</h3>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-muted)]">{example.summary}</p>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{example.details.join(' · ')}</p>
    </article>
  );
}

export default function FrequentServiceStory({ onExploreMap, agencies }: Props) {
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [selectedExampleId, setSelectedExampleId] = useState('translink-vancouver');
  const [storyStage, setStoryStage] = useState(0);
  const [frequencyMinutes, setFrequencyMinutes] = useState<15 | 30>(15);
  const storyScrollRef = useRef<HTMLDivElement>(null);
  const storyStepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const maxBar = Math.max(...frequentServiceStoryStats.headwayBars.map(bar => bar.agencies));
  const selectedBar = frequentServiceStoryStats.headwayBars.find(bar => bar.minutes === selectedMinutes);
  const selectedExamples = frequentServiceStoryExamples.filter(example => example.thresholdMinutes.includes(selectedMinutes));
  const selectedExample = selectedExamples.find(example => example.id === selectedExampleId) ?? selectedExamples[0];

  useEffect(() => {
    const root = storyScrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const visibleStages = new Set<number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const stage = Number((entry.target as HTMLElement).dataset.storyStage);
        if (entry.isIntersecting) visibleStages.add(stage);
        else visibleStages.delete(stage);
      });
      setStoryStage(Math.max(...visibleStages, 0));
    }, { root, threshold: 0.35 });
    storyStepRefs.current.forEach(step => { if (step) observer.observe(step); });
    return () => observer.disconnect();
  }, []);

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
    <div ref={storyScrollRef} className="h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)]">
      <article className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pt-20">
        <header className="mx-auto max-w-4xl text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Atlas research</p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[0.98]">What does “frequent” actually mean?</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-8 text-[var(--text-muted)]">
            A transit map can look full of lines and still leave you waiting. We reviewed {frequentServiceStoryStats.agenciesReviewed} agencies in the audit to see how their official system maps describe service people can actually rely on.
          </p>
          <a href="#story" className="mt-9 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">
            Read the research <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </header>

        <section aria-labelledby="network-story-heading" className="mx-auto mt-24 max-w-6xl sm:mt-32">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.65fr)] lg:items-start">
            <div className="lg:sticky lg:top-8">
              <FrequentServiceStoryMap agencies={agencies} stage={storyStage} frequencyMinutes={frequencyMinutes} />
            </div>
            <div className="space-y-[55vh] px-1 py-8 lg:py-16">
              <div ref={step => { storyStepRefs.current[0] = step; }} data-story-stage="0" className="max-w-md">
                <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Example: Toronto</p>
                <h2 id="network-story-heading" className="mt-3 text-3xl font-black tracking-tight">Start with the whole network.</h2>
                <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">A city can have hundreds of lines on its map. That shows where service exists, but not how long you might wait.</p>
              </div>
              <div ref={step => { storyStepRefs.current[1] = step; }} data-story-stage="1" className="max-w-md">
                <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">First filter</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">Remove rush-hour-only routes.</h2>
                <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">A route that appears only for the busiest part of the day is useful, but it is not the same promise as regular service.</p>
              </div>
              <div ref={step => { storyStepRefs.current[2] = step; }} data-story-stage="2" className="max-w-md">
                <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Second filter</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">Keep routes with meaningful daytime service.</h2>
                <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">The network gets smaller again when we remove routes that do not hold together through the day.</p>
              </div>
              <div ref={step => { storyStepRefs.current[3] = step; }} data-story-stage="3" className="max-w-md">
                <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Atlas comparison</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">Now show the routes frequent enough to rely on.</h2>
                <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">This is Atlas’s comparison—not a claim that every agency uses the same definition of “frequent.”</p>
                <div className="mt-5 inline-flex rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] p-1" role="group" aria-label="Choose the final frequency comparison">
                  {[15, 30].map(minutes => (
                    <button key={minutes} type="button" aria-pressed={frequencyMinutes === minutes} onClick={() => setFrequencyMinutes(minutes as 15 | 30)} className={`rounded-full px-4 py-2 text-sm font-black transition-colors ${frequencyMinutes === minutes ? 'bg-[var(--accent)] text-[var(--bg-app)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-btn-hover)]'}`}>
                      {minutes} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div id="story" className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <section aria-labelledby="why-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="why-heading" className="text-3xl sm:text-4xl font-black tracking-tight">A line on a map is not a promise.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Agencies use words like frequent, rapid, trunk, and primary to describe the routes that hold a network together. But those labels can mean a strict 10-minute promise, a 15-minute corridor, a service class with different dayparts, or simply a planning goal.
              </p>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                For this first batch, we used official system maps as the evidence boundary—not to replace each agency’s definition, but to understand what a rider can actually see on the map.
              </p>
            </div>
          </section>

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Explore the sample</p>
              <h2 id="chart-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">There is no single “frequent.”</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Pick an exact threshold to see how agencies turn that number into a map-visible service promise. This chart covers the 8 agencies whose system maps publish one exact numeric threshold; multi-tier ranges remain in the audit instead of being flattened.
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
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Each agency appears once. Only exact single thresholds from official system maps are shown here; ranges and maps with multiple tiers are preserved in the audit rather than assigned one misleading number.</p>
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
                <p><strong className="text-[var(--text-primary)]">Date conducted.</strong> {frequentServiceStoryStats.reviewedAt}.</p>
                <p><strong className="text-[var(--text-primary)]">Sample.</strong> We reviewed {frequentServiceStoryStats.agenciesReviewed} agencies: {frequentServiceStoryStats.countryCounts.map(item => `${item.agencies} in ${item.country}`).join(', ')}. Of those, {frequentServiceStoryStats.categoryCounts.numericDefinition} published a numeric definition on the map, {frequentServiceStoryStats.categoryCounts.qualitativeDefinition} published a qualitative frequent label, {frequentServiceStoryStats.categoryCounts.noDefinitionFound} had no named definition on the map, and {frequentServiceStoryStats.categoryCounts.mapUnavailable} could not be verified from an accessible current map.</p>
                <p><strong className="text-[var(--text-primary)]">Review boundary.</strong> For this first batch, only official current system maps and their map legends counted as evidence. Planning documents, route pages, schedules, and service guidelines were used only to locate a map or explain why a source was excluded.</p>
                <p><strong className="text-[var(--text-primary)]">What counted.</strong> A numeric definition required a frequency value printed on the map. A qualitative definition used a named frequent or high-frequency service on the map without a number. “No definition on map” means the reviewed map had no named definition; it does not mean the agency has no frequent service. “Unavailable” means the current map could not be retrieved or verified.</p>
                <p><strong className="text-[var(--text-primary)]">How we handled numbers.</strong> We kept published ranges, multiple tiers, dayparts, and geography intact. The chart shows only exact single thresholds; ranges and multi-tier definitions remain in the audit and are not converted into a misleading single number.</p>
                <p><strong className="text-[var(--text-primary)]">Limitations.</strong> This is a source-backed sample, not an exhaustive census of every transit agency or a universal definition of frequent service. It describes the research sample and does not change Atlas’s production frequency definitions.</p>
              </div>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
