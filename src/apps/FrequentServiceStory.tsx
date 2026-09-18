import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, MapPinned } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { frequentServiceStoryResearchRecord, frequentServiceStoryStats } from '../data/frequentServiceStory';
import FrequentServiceStoryMap from '../components/FrequentServiceStoryMap';
import type { Agency } from '../App';

interface Props {
  onExploreMap: () => void;
  agencies: Agency[];
}

export default function FrequentServiceStory({ onExploreMap, agencies }: Props) {
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [storyStage, setStoryStage] = useState(0);
  const [frequencyMinutes, setFrequencyMinutes] = useState<15 | 30>(15);
  const storyScrollRef = useRef<HTMLDivElement>(null);
  const storyStepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const maxBar = Math.max(...frequentServiceStoryStats.headwayBars.map(bar => bar.agencies));

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

  function exploreMap() {
    trackEvent('frequent_service_story_map_opened');
    onExploreMap();
  }

  return (
    <div ref={storyScrollRef} className="h-full overflow-x-hidden overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)]">
      <article className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pt-20">
        <header className="mx-auto max-w-4xl text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Atlas research</p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[0.98]">What does “frequent” actually mean?</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-8 text-[var(--text-muted)]">
            A transit map can look full of lines and still leave you waiting. We reviewed {frequentServiceStoryStats.agenciesReviewed} agencies in the audit to see how their official system maps describe service people can actually rely on.
          </p>
          <a href="#story" className="mt-9 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">
            Explore the research <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </header>

        <section aria-labelledby="network-story-heading" className="mx-auto mt-24 max-w-6xl sm:mt-32">
          <div className="relative min-w-0 pb-[55vh]">
            <div className="min-w-0 lg:sticky lg:top-24">
              <FrequentServiceStoryMap agencies={agencies} stage={storyStage} frequencyMinutes={frequencyMinutes} onFrequencyChange={setFrequencyMinutes} researchRecord={frequentServiceStoryResearchRecord} />
            </div>
            <div className="relative z-10 space-y-[55vh] pb-8 pt-8 lg:pb-16" aria-hidden="true">
                {[0, 1, 2, 3].map(stage => <div key={stage} ref={step => { storyStepRefs.current[stage] = step; }} data-story-stage={stage} className="h-[20vh]" />)}
            </div>
          </div>
        </section>

        <div id="story" className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <section aria-labelledby="why-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="why-heading" className="text-3xl sm:text-4xl font-black tracking-tight">A line on a map is not a promise.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Agencies use words like frequent, rapid, trunk, and primary to describe the routes that hold a network together. But those labels can mean a strict 10-minute promise, a 15-minute corridor, a service class that changes at different times of day, or simply a planning goal.
              </p>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                We used official system maps first, with approved official rider-facing service pages when a current map was unavailable or insufficient—not to replace each agency’s definition, but to record what the agency actually publishes.
              </p>
            </div>
          </section>

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] uppercase tracking-[0.24em] font-black text-[var(--accent)]">Explore the sample</p>
              <h2 id="chart-heading" className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">There is no single “frequent.”</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Pick a representative threshold to see how agencies turn that number into a service promise. This chart covers {frequentServiceStoryStats.namedNumericAgencies} agencies with a defensible representative numeric definition; secondary tiers remain in the audit instead of being flattened.
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
                    onClick={() => setSelectedMinutes(bar.minutes)}
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
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Each agency appears once. The chart uses the agency’s general or representative frequent-service tier; ranges, dayparts, and secondary tiers remain in the audit rather than being assigned one misleading number.</p>
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

          <footer className="mx-auto max-w-3xl border-t border-[var(--border-primary)] pt-10">
            <div className="w-full">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">How we did this</h2>
              <div className="mt-5 space-y-5 text-sm sm:text-base leading-7 sm:leading-8 text-[var(--text-muted)]">
                <p><strong className="text-[var(--text-primary)]">Date conducted.</strong> {frequentServiceStoryStats.reviewedAt}.</p>
                <p><strong className="text-[var(--text-primary)]">Sample.</strong> We reviewed {frequentServiceStoryStats.agenciesReviewed} agencies: {frequentServiceStoryStats.countryCounts.map(item => `${item.agencies} in ${item.country}`).join(', ')}. Of those, {frequentServiceStoryStats.categoryCounts.numericDefinition} published a numeric definition, {frequentServiceStoryStats.categoryCounts.qualitativeDefinition} published a qualitative frequent label, {frequentServiceStoryStats.categoryCounts.noDefinitionFound} had no named definition in the reviewed rider-facing material, and {frequentServiceStoryStats.categoryCounts.mapUnavailable} could not be verified from an accessible current system map.</p>
                <p><strong className="text-[var(--text-primary)]">Review boundary.</strong> Official current system maps and map legends were preferred. When a map was unavailable or insufficient, an official rider-facing service-definition page was allowed and its source type was recorded. Planning documents, generic schedules, and service standards were not treated as definitions unless they explicitly named the agency’s frequent product.</p>
                <p><strong className="text-[var(--text-primary)]">What counted.</strong> A numeric definition required the agency to name frequent/high-frequency service and give a frequency value or range. A qualitative definition required the named frequent/high-frequency label without a number. “No definition” means the reviewed official material did not name one; it does not mean the agency has no frequent service. “Unavailable” means the current system map could not be located or verified.</p>
                <p><strong className="text-[var(--text-primary)]">How we handled numbers.</strong> We recorded every named tier. The chart counts each agency once using its general or representative frequent tier; express, peak-only, rail-only, and other secondary tiers remain in the audit as context.</p>
                <p><strong className="text-[var(--text-primary)]">Limitations.</strong> This is a source-backed sample, not an exhaustive census of every transit agency or a universal definition of frequent service. It describes the research sample and does not change Atlas’s production frequency definitions.</p>
              </div>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
