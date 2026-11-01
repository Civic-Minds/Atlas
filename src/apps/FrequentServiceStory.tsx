import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, MapPinned } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { headwayEveryRange } from '../utils/headwayText';
import { type DataTableColumn } from '../components/ui/DataTable';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import RankedBars from '../components/charts/RankedBars';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import { frequentServiceDefinitionSample, frequentServiceStoryResearchRecord, frequentServiceStoryStats } from '../data/frequentServiceStory';
import FrequentServicePublishedMapMontage from '../components/FrequentServicePublishedMapMontage';
import FrequentServiceStoryMap from '../components/FrequentServiceStoryMap';
import PageShell from '../components/ui/PageShell';
import type { Agency } from '../App';
import { headwayAmount } from '../../shared/headwayText';

interface Props {
  onExploreMap: () => void;
  agencies: Agency[];
}

type HeadwayBar = (typeof frequentServiceStoryStats.headwayBars)[number];
const HEADWAY_COLUMNS: DataTableColumn<HeadwayBar>[] = [
  { key: 'wait', header: 'Wait', cell: bar => headwayAmount(bar.minutes), rowHeader: true, className: 'font-normal', width: 5 },
  { key: 'oct11', header: 'Agencies, Oct\u00a011', cell: bar => bar.agenciesOct11, className: 'tabular-nums', width: 6.5 },
  { key: 'oct30', header: 'Agencies, Oct\u00a030', cell: bar => bar.agencies, className: 'tabular-nums', width: 6.5 },
];

export default function FrequentServiceStory({ onExploreMap, agencies }: Props) {
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [storyStage, setStoryStage] = useState(0);
  const frequencyMinutes = 15 as const;
  const storyStepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const maxBar = Math.max(...frequentServiceStoryStats.headwayBars.map(bar => bar.agencies));

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibleStages = new Set<number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const stage = Number((entry.target as HTMLElement).dataset.storyStage);
        if (entry.isIntersecting) visibleStages.add(stage);
        else visibleStages.delete(stage);
      });
      setStoryStage(Math.max(...visibleStages, 0));
    }, { threshold: 0.35 });
    storyStepRefs.current.forEach(step => { if (step) observer.observe(step); });
    return () => observer.disconnect();
  }, []);

  function exploreMap() {
    trackEvent('frequent_service_story_map_opened');
    onExploreMap();
  }

  const method = (
    <ResearchMethod parts={{
      dateConducted: <>October 11, 2026.</>,
      dateUpdated: <>October 30, 2026.</>,
      sample: <>We looked for an official definition of frequent service at {frequentServiceDefinitionSample.agencies} agencies Atlas covers in Canada ({frequentServiceDefinitionSample.canada}) and the United States ({frequentServiceDefinitionSample.unitedStates}). We couldn't check {frequentServiceDefinitionSample.blocked} others because their websites block automated visits. {frequentServiceDefinitionSample.namedNetwork} have a named frequent network, such as a “Frequent Network”. {frequentServiceDefinitionSample.withWait} of those say how often the bus comes, such as “every 15 minutes or better”. The chart shows {frequentServiceStoryStats.chartedAgencies} of those {frequentServiceDefinitionSample.withWait} agencies, checked again on October 30.</>,
      sources: <>The agency’s own current system map, rider guide, frequent network page, service standards, or a plan for the network running today.</>,
      whatCounted: <>Each quote was checked by script against the saved page. When an agency’s pages disagreed, we used the narrower definition. Not finding a definition does not mean an agency has no frequent service.</>,
      numbers: <>When an agency has more than one frequent tier, we used the fastest one that covers more than one route. When it gives a range, such as {headwayEveryRange(15, 20)}, we used the slower number, for weekday daytime.</>,
      rechecked: <>On October 30, 2026, we opened the source again for each of the {frequentServiceStoryStats.recheckedAgencies} agencies the chart counted. {frequentServiceStoryStats.namedNumericAgencies} still matched and stay in the chart. {frequentServiceStoryStats.recheckLeftOut} are left out: Anchorage's and VIA's maps are gone, DART's site returned an error, Foothill's and Sun Tran's sites block automated visits, and STM's page doesn't show the times to one.</>,
      limitations: <>This is a source-backed sample, not an exhaustive census of every transit agency or a universal definition of frequent service. It describes the research sample and does not change Atlas’s production frequency definitions.</>,
    }} />
  );

  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          width="story"
          title="What happens when you miss the bus?"
          intro={<>
            <p>Miss one when the next vehicle comes in 10 minutes? Annoying, but manageable. Miss one when the next one takes 30? That can change your whole trip.</p>
            <p>Transit maps show where routes go. Transit planning asks the harder questions: how often does service come, how long does it run, and who is it designed to reach?</p>
            <p>We checked how {frequentServiceDefinitionSample.agencies} agencies define frequent service on their own websites, to show how those decisions turn a network of lines into service people can actually rely on.</p>
          </>}
        >
          <div className="w-full max-w-5xl text-left">
            <FrequentServicePublishedMapMontage />
          </div>
          <a href="#story" className="mt-9 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">
            Explore the research <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </ResearchHeader>

        {/* CIV-1169 (Ryan's pick 6): a text break between the montage and the first map. */}
        <section id="story" aria-labelledby="story-break-heading" className="scroll-mt-16 mx-auto mt-24 w-full max-w-[48rem] sm:mt-32">
          <h2 id="story-break-heading" className="text-3xl sm:text-4xl font-black tracking-tight">Every map tells it differently.</h2>
          <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
            Each agency decides what its map shows, so one map is hard to compare with the next. Atlas starts from the schedules instead. Here is Toronto's network, built from the TTC's own schedule data, one step at a time.
          </p>
        </section>

        <section aria-labelledby="network-story-heading" className="relative left-1/2 mt-24 w-screen -translate-x-1/2 px-2 sm:mt-32 sm:px-3">
          <div className="relative min-w-0 pb-[12vh]">
            <div className="min-w-0 lg:sticky lg:top-24">
              <FrequentServiceStoryMap agencies={agencies} stage={storyStage} frequencyMinutes={frequencyMinutes} researchRecord={frequentServiceStoryResearchRecord} />
            </div>
            <div className="relative z-10 space-y-[55vh] pb-8 pt-8 lg:pb-16" aria-hidden="true">
                {[0, 1, 2, 3].map(stage => <div key={stage} ref={step => { storyStepRefs.current[stage] = step; }} data-story-stage={stage} className="h-[20vh]" />)}
            </div>
          </div>
        </section>

        <div className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <section aria-labelledby="why-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="why-heading" className="text-3xl sm:text-4xl font-black tracking-tight">Coverage and frequency do different jobs.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Coverage asks: can transit reach my neighbourhood? Frequency asks: how long will I wait once it does? A route can be useful for coverage without coming often enough to be useful for a spontaneous trip.
              </p>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Planners often run more service where many people travel, while keeping less-frequent routes so more places stay connected. Good networks need both—but they serve different purposes.
              </p>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                We reviewed current official system maps and approved rider guides. If the source was unavailable, we recorded that result rather than substituting a schedule, planning document, or service-definition page.
              </p>
            </div>
          </section>

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <h2 id="chart-heading" className="text-3xl sm:text-4xl font-black tracking-tight">There is no single “frequent.”</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">
                Pick a representative threshold to see how agencies turn that number into a service promise. This chart covers {frequentServiceStoryStats.chartedAgencies} agencies with a verified numeric definition; secondary tiers remain in the research instead of being flattened.
              </p>
            </div>
            <div className="mt-10" aria-label="Interactive chart showing the number of agencies by the selected published frequent-service threshold">
              <RankedBars
                as="buttons"
                bars={frequentServiceStoryStats.headwayBars.map(bar => ({ key: bar.minutes, label: headwayAmount(bar.minutes), value: bar.agencies, fill: selectedMinutes === bar.minutes ? 'var(--accent)' : 'var(--text-muted)' }))}
                max={maxBar}
                listClassName="space-y-4"
                rowClassName="grid w-full grid-cols-[4.5rem_1fr_3rem] items-center gap-3 rounded-lg text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
                labelClassName="font-black text-[var(--text-primary)]"
                fillClassName="transition-[width,background-color]"
                selectedKey={selectedMinutes}
                onSelect={key => setSelectedMinutes(key as number)}
                describe={bar => `Show examples for ${bar.key}-minute service (${bar.value} agencies)`}
              />
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Each agency appears once, at the slowest wait its source gives for weekday daytime service: “every 15–20 minutes” counts as 20. Other times of day and secondary tiers remain in the research. Checked again on October 30, 2026. {frequentServiceStoryStats.recheckLeftOut} agencies are left out because their page is gone or couldn't be checked again.</p>
              <ChartTableDetails caption="There is no single “frequent.”" columns={HEADWAY_COLUMNS} rows={frequentServiceStoryStats.headwayBars} rowKey={bar => bar.minutes} />
            </div>
          </section>

          <section aria-labelledby="more-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="more-heading" className="text-3xl sm:text-4xl font-black tracking-tight">The number is only the beginning.</h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-muted)]">A frequency threshold is attached to a span, a set of days, and a geography. It may describe a route, a corridor, a network, or a product that combines modes. A 15-minute route that stops at 6 PM is a different promise from a 15-minute corridor that runs into the evening. That is why we track three things together: headway, service span, and geography.</p>
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
        </div>
      </article>
    </PageShell>
  );
}
