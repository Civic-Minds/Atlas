import { useEffect, useId, useRef, useState } from 'react';
import { longDate } from '../../shared/dateText';
import { ArrowDown } from 'lucide-react';
import ArrowLink from '../components/ui/ArrowLink';
import { trackEvent } from '../lib/analytics';
import { headwayEveryRange } from '../utils/headwayText';
import { type DataTableColumn } from '../components/ui/DataTable';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import RankedBars from '../components/charts/RankedBars';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import { frequentServiceDefinitionSample, frequentServiceStoryResearchRecord, frequentServiceStoryStats, frequentWeekendCities } from '../data/frequentServiceStory';
import FrequentServicePublishedMapMontage from '../components/FrequentServicePublishedMapMontage';
import FrequentServiceStoryMap from '../components/FrequentServiceStoryMap';
import PageShell from '../components/ui/PageShell';
import { UNDERLINED_LINK } from '../pageStyles';
import type { Agency } from '../App';
import { headwayAmount, headwayFilterLabel, headwayOrBetter } from '../../shared/headwayText';
import { countOf } from '../../shared/overflowText';
import Pill from '../components/ui/Pill';
import { CHART_TEXT } from '../components/charts/useActivePart';
import { hourTime } from '../../shared/timeText';

/** The story's section headings and body paragraphs, one look each. */
const STORY_HEADING = 'text-3xl sm:text-4xl font-black tracking-tight';
const STORY_PARAGRAPH = 'mt-5 text-base leading-8 text-[var(--text-muted)]';
/** The hero's in-page jump buttons (Explore the research, See the method): one pill, so the two match. */
const STORY_JUMP_BUTTON = 'inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]';

interface Props {
  onExploreMap: () => void;
  agencies: Agency[];
}

/** The method box's dates (shared/dateText.ts writes them). "Date updated" is the definitions research: the recheck of
 * every charted agency's source, October 30 to November 3 (CIV-1569). */
const FREQUENT_SERVICE_CONDUCTED = '2026-10-11';
const FREQUENT_SERVICE_DEFINITIONS_UPDATED = '2026-11-03';

type HeadwayBar = (typeof frequentServiceStoryStats.headwayBars)[number];
const HEADWAY_COLUMNS: DataTableColumn<HeadwayBar>[] = [
  { key: 'wait', header: 'Wait', cell: bar => headwayAmount(bar.minutes), rowHeader: true, className: 'font-normal', width: 5 },
  { key: 'oct11', header: 'Agencies, Oct\u00a011', cell: bar => bar.agenciesOct11, width: 6.5 },
  { key: 'oct30', header: 'Agencies, Oct\u00a030', cell: bar => bar.agencies, width: 6.5 },
];

/**
 * CIV-1603 section 1: the drop from every agency we could check, to those with a named frequent network, to those that give
 * a number, to those the agency chart shows. The same counts as the method box (frequentServiceDefinitionSample,
 * frequentServiceStoryStats.chartedAgencies); nothing is recounted.
 * Bar names, heading, intro, note and chart name approved word for word by Ryan (2026-11-15).
 */
const DEFINITION_FUNNEL = [
  { key: 'checked', label: 'Checked', agencies: frequentServiceDefinitionSample.agencies },
  { key: 'named', label: 'Named frequent network', agencies: frequentServiceDefinitionSample.namedNetwork },
  { key: 'number', label: 'Say how often', agencies: frequentServiceDefinitionSample.withWait },
  // The agency chart's own count: still confirmed on the October 30 recheck, after the tier rule (CIV-1178).
  { key: 'charted', label: 'In the chart above', agencies: frequentServiceStoryStats.chartedAgencies },
] as const;
type DefinitionStep = (typeof DEFINITION_FUNNEL)[number];
const DEFINITION_COLUMNS: DataTableColumn<DefinitionStep>[] = [
  { key: 'step', header: 'Step', cell: step => step.label, rowHeader: true, className: 'font-normal', width: 10 },
  { key: 'agencies', header: 'Agencies', cell: step => step.agencies, width: 6 },
];

/** CIV-1603 section 3: weekday and Sunday routes at a threshold (frequent-weekend-counts.json). */
const WEEKEND_THRESHOLDS = [15, 30] as const;
type WeekendThreshold = (typeof WEEKEND_THRESHOLDS)[number];
type WeekendCity = (typeof frequentWeekendCities)[number];
const weekendCounts = (city: WeekendCity, minutes: WeekendThreshold) => (minutes === 15
  ? { weekday: city.weekday15, sunday: city.sunday15 }
  : { weekday: city.weekday30, sunday: city.sunday30 });
const WEEKEND_COLUMNS: DataTableColumn<WeekendCity>[] = [
  { key: 'city', header: 'City', cell: city => city.city, rowHeader: true, className: 'font-normal', width: 8 },
  ...WEEKEND_THRESHOLDS.flatMap(minutes => [
    { key: `weekday${minutes}`, header: `Weekday, ${headwayFilterLabel(minutes)}`, cell: (city: WeekendCity) => weekendCounts(city, minutes).weekday, width: 6 },
    { key: `sunday${minutes}`, header: `Sunday, ${headwayFilterLabel(minutes)}`, cell: (city: WeekendCity) => weekendCounts(city, minutes).sunday, width: 6 },
  ]),
];

export default function FrequentServiceStory({ onExploreMap, agencies }: Props) {
  const tableId = useId();
  const definitionTableId = useId();
  const weekendTableId = useId();
  const [weekendMinutes, setWeekendMinutes] = useState<WeekendThreshold>(15);
  const [storyStage, setStoryStage] = useState(0);
  const frequencyMinutes = 15 as const;
  const storyStepRefs = useRef<Array<HTMLDivElement | null>>([]);
  const maxBar = Math.max(...frequentServiceStoryStats.headwayBars.map(bar => bar.agencies));
  // The most common threshold is highlighted while nothing else is, like the age chart's most common age (CIV-1286).
  const commonBar = frequentServiceStoryStats.headwayBars.reduce((top, bar) => (bar.agencies > top.agencies ? bar : top));

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
      dateConducted: <>{longDate(FREQUENT_SERVICE_CONDUCTED)}.</>,
      dateUpdated: <>{longDate(FREQUENT_SERVICE_DEFINITIONS_UPDATED)}.</>,
      sample: <>We looked for an official definition of frequent service at {frequentServiceDefinitionSample.agencies} agencies Atlas covers in Canada ({frequentServiceDefinitionSample.canada}) and the United States ({frequentServiceDefinitionSample.unitedStates}). We couldn’t check {frequentServiceDefinitionSample.blocked} others because their websites block automated visits. {frequentServiceDefinitionSample.namedNetwork} have a named frequent network, such as a “Frequent Network”. {frequentServiceDefinitionSample.withWait} of those say how often the bus comes, such as “every 15 minutes or better”. The chart shows {frequentServiceStoryStats.chartedAgencies} of those {frequentServiceDefinitionSample.withWait} agencies, checked again between October 30 and November 3.</>,
      sources: <>The agency’s own current system map, rider guide, frequent network page, service standards or a plan for the network running today. Shelter photo: <a className={UNDERLINED_LINK} href="https://commons.wikimedia.org/wiki/File:TTC_Bus_Stop_on_Port_Union_Road,_April_30_2026.jpg" rel="noopener noreferrer">Dillan Payne</a>, <a className={UNDERLINED_LINK} href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer">CC BY-SA 4.0</a>, cut out and adapted.</>,
      whatCounted: <>Each quote was checked by script against the saved page. When an agency’s pages disagreed, we used the narrower definition. Not finding a definition does not mean an agency has no frequent service.</>,
      numbers: <>When an agency has more than one frequent tier, we used the fastest one that covers more than one route. When it gives a range, such as {headwayEveryRange(15, 20)}, we used the slower number, for weekday daytime.</>,
      rechecked: <>Between October 30 and November 3, we opened the source again for each of the {frequentServiceStoryStats.recheckedAgencies} agencies the chart counted. {frequentServiceStoryStats.namedNumericAgencies} still matched and {frequentServiceStoryStats.chartedAgencies} stay in the chart. {frequentServiceStoryStats.recheckLeftOut} are left out: Anchorage’s and VIA’s maps are gone, DART’s site returned an error, Foothill’s and Sun Tran’s sites block automated visits, and STM’s page doesn’t show the times to one.</>,
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
          {/* Ryan, 2026-11-14: a second button jumps to the story's own Method section at the bottom. */}
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href="#story" className={STORY_JUMP_BUTTON}>
              Explore the research <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a href="#research-method-heading" className={STORY_JUMP_BUTTON}>
              See the method <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </ResearchHeader>

        {/* CIV-1169 (Ryan's pick 6): a text break between the montage and the first map. */}
        <section id="story" aria-labelledby="story-break-heading" className="scroll-mt-16 mx-auto mt-24 w-full max-w-[48rem] sm:mt-32">
          <h2 id="story-break-heading" className={STORY_HEADING}>Every map tells it differently.</h2>
          {/* CIV-1168 bridge, Ryan approved version A word for word on 2026-11-02 (_review/frequent-bridge),
              with its times and wait in Atlas's style ("6 AM", "every 10 min") from the shared helpers. Every claim is from the montage's own
              maps, linked under each frame; Toronto's hours are its Ten-Minute Network definition (definition-quotes-2026-10-11.json, ttc). */}
          <p className={STORY_PARAGRAPH}>
            Each agency decides what its map shows, so one map is hard to compare with the next. Toronto’s Ten-Minute Network means a bus or streetcar {headwayOrBetter(10)}, from {hourTime(6)} to {hourTime(25)}. Vancouver and Los Angeles both draw the line at 15 minutes, but Vancouver checks it until {hourTime(21)} every day of the week, and Los Angeles only on weekdays until {hourTime(18)}. Washington, DC has two levels, one at 12 minutes and one at 20. Miami-Dade’s map doesn’t use the word frequent at all. It colours every route by how often the bus comes at weekday midday.
          </p>
          <p className={STORY_PARAGRAPH}>
            The maps also differ in what they draw. Vancouver’s and Portland’s show only the frequent network, so a slower route isn’t on the map. Toronto’s, Ottawa’s and Seattle’s draw every route and mark the frequent ones. Seattle also counts two routes that share a street as frequent together, which none of the other maps here do.
          </p>
          <p className={STORY_PARAGRAPH}>
            Atlas starts from the schedules instead. Here is Toronto’s network, built from the TTC’s own schedule data, one step at a time.
          </p>
        </section>

        <section aria-labelledby="network-story-heading" className="relative left-1/2 mt-24 w-screen -translate-x-1/2 px-2 sm:mt-32 sm:px-3">
          <div className="relative min-w-0 pb-[12vh]">
            {/* #1310: pinned below the page's sticky header at every width, and held through the last stage (the bottom padding),
                so a stage heading never scrolls under the Atlas logo while it is the one being read. */}
            <div className="sticky top-16 min-w-0 lg:top-24">
              <FrequentServiceStoryMap agencies={agencies} stage={storyStage} frequencyMinutes={frequencyMinutes} researchRecord={frequentServiceStoryResearchRecord} />
            </div>
            <div className="relative z-10 space-y-[55vh] pb-[60vh] pt-8" aria-hidden="true">
                {[0, 1, 2, 3].map(stage => <div key={stage} ref={step => { storyStepRefs.current[stage] = step; }} data-story-stage={stage} className="h-[20vh]" />)}
            </div>
          </div>
        </section>

        <div className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <section aria-labelledby="why-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="why-heading" className={STORY_HEADING}>Coverage and frequency do different jobs.</h2>
              <p className={STORY_PARAGRAPH}>
                Coverage asks: can transit reach my neighbourhood? Frequency asks: how long will I wait once it does? A route can be useful for coverage without coming often enough to be useful for a spontaneous trip.
              </p>
              <p className={STORY_PARAGRAPH}>
                Planners often run more service where many people travel, while keeping less-frequent routes so more places stay connected. Good networks need both—but they serve different purposes.
              </p>
              <p className={STORY_PARAGRAPH}>
                We reviewed current official system maps and approved rider guides. If the source was unavailable, we recorded that result rather than substituting a schedule, planning document or service-definition page.
              </p>
            </div>
          </section>

          <section aria-labelledby="chart-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <h2 id="chart-heading" className={STORY_HEADING}>There is no single “frequent.”</h2>
              <p className={STORY_PARAGRAPH}>
                Pick a representative threshold to see how agencies turn that number into a service promise. This chart shows the {frequentServiceStoryStats.chartedAgencies} agencies that publish a specific number of minutes. Fifteen minutes is the most common choice. Transit planner <a className={UNDERLINED_LINK} href="https://humantransit.org/2011/12/how-frequent-is-freedom.html" rel="noopener noreferrer">Jarrett Walker</a> puts “the threshold of ‘high frequency’” at “around every 15 minutes all day.” The industry’s <a className={UNDERLINED_LINK} href="https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_165ch-05.pdf" rel="noopener noreferrer">planning manual</a> says that at 10 minutes or better there is “no need for passengers to consult schedules.”
              </p>
            </div>
            <div className="mt-10">
              <RankedBars
                label="Interactive chart showing the number of agencies by the selected published frequent-service threshold"
                bars={frequentServiceStoryStats.headwayBars.map(bar => ({ key: bar.minutes, label: headwayAmount(bar.minutes), value: bar.agencies, fill: 'var(--text-muted)', sentence: `Show examples for ${bar.minutes}-minute service (${bar.agencies} agencies)` }))}
                max={maxBar}
                defaultKey={commonBar.minutes}
                details={tableId}
              />
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">Each agency appears once, at the slowest wait its source gives for weekday daytime service: “every 15–20 minutes” counts as 20. Other times of day and secondary tiers remain in the research. Checked again between October 30 and November 3. {frequentServiceStoryStats.recheckLeftOut} agencies are left out because their page is gone or couldn’t be checked again.</p>
              <ChartTableDetails id={tableId} caption="There is no single “frequent.”" columns={HEADWAY_COLUMNS} rows={frequentServiceStoryStats.headwayBars} rowKey={bar => bar.minutes} />
            </div>
          </section>

          {/* CIV-1603 section 1 (Ryan's pick, 2026-11-14): most agencies don't publish a number. Heading, intro and caption approved word for word by Ryan (2026-11-15). */}
          <section aria-labelledby="definitions-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <h2 id="definitions-heading" className={STORY_HEADING}>Most agencies don’t publish a number.</h2>
              <p className={STORY_PARAGRAPH}>We looked for an official definition of frequent service at {frequentServiceDefinitionSample.agencies} agencies. {frequentServiceDefinitionSample.namedNetwork} have a named frequent network, such as a “Frequent Network”. {frequentServiceDefinitionSample.withWait} of those say how often the bus comes, such as “every 15 minutes or better”. Not finding a definition does not mean an agency has no frequent service.</p>
            </div>
            <div className="mt-10">
              <RankedBars
                label="Chart showing how many agencies define frequent service, from every agency checked to the ones in the chart above"
                bars={DEFINITION_FUNNEL.map(step => ({ key: step.key, label: step.label, value: step.agencies, fill: 'var(--text-muted)', sentence: `${step.label}: ${countOf(step.agencies, 'agency', 'agencies')}` }))}
                max={frequentServiceDefinitionSample.agencies}
                details={definitionTableId}
              />
              <p className="mt-5 text-xs leading-5 text-[var(--text-dim)]">We couldn’t check {frequentServiceDefinitionSample.blocked} others because their websites block automated visits. The last bar counts the agencies still confirmed when we checked again between October 30 and November 3.</p>
              <ChartTableDetails id={definitionTableId} caption="Most agencies don’t publish a number." columns={DEFINITION_COLUMNS} rows={DEFINITION_FUNNEL} rowKey={step => step.key} />
            </div>
          </section>

          {/* CIV-1603 section 2 slot: the cities (CIV-1577). Not built here; it goes between section 1 and section 3. */}

          {/* CIV-1603 section 3 (Ryan's pick, 2026-11-14): how much of a city's frequent network still counts on Sunday. Each
              bar is a count of routes the main map draws at the threshold at midday (Ryan picked midday only: Sunday has no rush
              hour), from frequent-weekend-counts.json. Each city's bars share its weekday count as the full width, so the
              Sunday bar reads as the share that is left. Heading, intro and caption are placeholders until Ryan approves wording. */}
          <section aria-labelledby="weekend-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
            <div className="max-w-2xl">
              <h2 id="weekend-heading" className={STORY_HEADING}>[Ryan’s wording: section 3 heading]</h2>
              <p className={STORY_PARAGRAPH}>[Ryan’s wording: section 3 intro]</p>
            </div>
            <div className="mt-8 flex gap-1.5" role="group" aria-label="[Ryan’s wording: threshold picker name for screen readers]">
              {WEEKEND_THRESHOLDS.map(minutes => (
                <Pill key={minutes} size="segment" tone="outline" selected={weekendMinutes === minutes} onClick={() => setWeekendMinutes(minutes)}>
                  {headwayFilterLabel(minutes)}
                </Pill>
              ))}
            </div>
            <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {frequentWeekendCities.map(city => {
                const counts = weekendCounts(city, weekendMinutes);
                return (
                  <div key={city.city}>
                    <h3 className={`mb-3 font-bold ${CHART_TEXT}`}>{city.city}</h3>
                    <RankedBars
                      label={`${city.city}, ${headwayFilterLabel(weekendMinutes)}`}
                      bars={[
                        { key: 'weekday', label: 'Weekday', value: counts.weekday, fill: 'var(--text-muted)', sentence: `${city.city}, Weekday: ${countOf(counts.weekday, 'route')}` },
                        { key: 'sunday', label: 'Sunday', value: counts.sunday, fill: 'var(--text-muted)', sentence: `${city.city}, Sunday: ${countOf(counts.sunday, 'route')}` },
                      ]}
                      max={Math.max(counts.weekday, counts.sunday, 1)}
                      details={weekendTableId}
                      // A Sunday with no route at the threshold is the point: its empty bar stays (chartCategories).
                      keepEmpty
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-xs leading-5 text-[var(--text-dim)]">[Ryan’s wording: section 3 caption]</p>
            <ChartTableDetails id={weekendTableId} caption="[Ryan’s wording: section 3 heading]" columns={WEEKEND_COLUMNS} rows={frequentWeekendCities} rowKey={city => city.city} />
          </section>

          <section aria-labelledby="more-heading" className="mx-auto w-full max-w-[48rem]">
            <div>
              <h2 id="more-heading" className={STORY_HEADING}>The number is only the beginning.</h2>
              <p className={STORY_PARAGRAPH}>A frequency threshold is attached to a span, a set of days and a geography. It may describe a route, a corridor, a network or a product that combines modes. A 15-minute route that stops at 6 PM is a different promise from a 15-minute corridor that runs into the evening. That is why we track three things together: headway, service span and geography.</p>
            </div>
          </section>

          <section aria-labelledby="atlas-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-6 sm:p-10">
                <h2 id="atlas-heading" className={STORY_HEADING}>Now find your own network.</h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">The research explains the categories. Atlas lets you apply one consistent test to the routes around you. Search for a city, compare 15- and 30-minute service, and see where the useful network actually holds together.</p>
            {/* Ryan, 2026-11-14: no dark buttons. The About page's pattern: the main action as ArrowLink, then an outline pill. */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ArrowLink as="button" type="button" onClick={exploreMap}>Find your city</ArrowLink>
              <a href="#research-method-heading" className={STORY_JUMP_BUTTON}>
                See the method <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
