import { useEffect, useRef, useState, type ReactNode } from 'react';
import { longDate } from '../../shared/dateText';
import { clockTime, hourTime } from '../../shared/timeText';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import PageShell from '../components/ui/PageShell';
import AirportStoryMap, { ZOOMS } from '../components/AirportStoryMap';
import { AIRPORTS, landableAt, landableCount } from '../data/airportHourly';
import { useColorVision } from '../context/ColorVisionContext';
import { AIRPORT_STORY_DRAFT } from '../../shared/researchStories';
import { STORY_HEADING, STORY_PARAGRAPH } from '../pageStyles';
import { DevPlaceholder, devPlaceholder } from '../content/devPlaceholder';

/**
 * CIV-1550: the airport story, local dev only (main.tsx registers it under import.meta.env.DEV, so it is in no built
 * bundle). A scroll story on the Frequent service story's pattern (its sticky map and IntersectionObserver steps): a
 * sticky map of the 157 airports through one weekday, morning to overnight, 6 AM to 6 AM the next morning hour by hour
 * with scroll. Ryan's pick (2026-11-16): the page keeps the reader's own theme throughout (no blend to dark at night), and
 * the week grid stays further down. The hours after midnight use the same weekday's masks (Tuesday stands for every
 * weekday), so the closing 6 AM shows the opening 6 AM's airports. All text is a draft
 * for Ryan's review; nothing here is approved yet. Counts come from src/data/airport-hourly.json.
 */

const STEP_TEXT = 'text-base leading-7 text-[var(--text-primary)]';
const PLACEHOLDER = 'mt-5 text-xs leading-5 text-[var(--text-dim)]';

const AIRPORT_STORY_CONDUCTED = '2026-11-14';
const TOTAL = AIRPORTS.length;
const downtownAt = (hour: number) => landableCount(AIRPORTS, 'wk', hour);

/** Every hour the map shows, 6 AM to 6 AM the next morning; the scroll position walks through them one slot each. */
const HOURS = Array.from({ length: 25 }, (_, i) => (6 + i) % 24);
/** An hour's slot in HOURS, counted from the opening 6 AM; `nextDay` picks the closing 6 AM. */
const slotOf = (hour: number, nextDay = false) => (nextDay ? HOURS.lastIndexOf(hour) : HOURS.indexOf(hour));

/** Memphis (MEM): its one route, 28, has no weekday departure from the airport in the 11 AM and 12 PM hours. */
const MEMPHIS = AIRPORTS.find(a => a.code === 'MEM');
const MEMPHIS_GAP = [11, 12].filter(h => MEMPHIS && !landableAt(MEMPHIS, 'wk', h, 'any'));

/**
 * The weekday's text cards. Each shows from its slot until the next card's. Memphis (CIV-1550 draft contrast): of the large airports, the one whose last weekday bus
 * downtown leaves earliest (route 28, 4:34 PM, a constant from the study: the data holds hours, not minutes). Oakland's
 * earlier last trip is left out: its only direct rides are overnight buses, and BART runs all day with a change.
 */
const STEPS: { hour: number; slot: number; text: ReactNode }[] = [
  { hour: 6, slot: slotOf(6), text: <>It’s {hourTime(6)}. At {downtownAt(6)} of {TOTAL} airports, a bus or train leaves for downtown within the hour.</> },
  { hour: 11, slot: slotOf(11), text: <><DevPlaceholder what="Memphis midday gap" /> At Memphis, no bus leaves the airport in the {MEMPHIS_GAP.map(h => hourTime(h)).join(' and ')} hours. The last bus downtown leaves at {clockTime(16 * 60 + 34)}.</> },
  { hour: 19, slot: slotOf(19), text: <>{downtownAt(19)} airports still have a ride downtown within the hour. One by one, the last buses leave. <DevPlaceholder what="7 PM, count drops or another airport" /></> },
  { hour: 23, slot: slotOf(23), text: <>At {hourTime(23)}, {downtownAt(23)} airports have a ride downtown within the hour. At Pearson, the UP Express to Union Station runs until {clockTime(24 * 60 + 54)}.</> },
  // The 747 meets 1:57 AM only on Saturday and Sunday; on the weekday it leaves at 1:41 and 2:33 AM (route 356 at 1:57 AM).
  { hour: 3, slot: slotOf(3), text: <>At {hourTime(3)}, only {landableCount(AIRPORTS, 'wk', 3, 'any')} airports have any transit within the hour, and {downtownAt(3)} go straight downtown. <DevPlaceholder what={`Montréal pair. On weekdays the 747 leaves at ${clockTime(25 * 60 + 41)} and ${clockTime(26 * 60 + 33)}; it leaves at ${clockTime(25 * 60 + 57)} only on Saturday and Sunday. Route 356 leaves for downtown at ${clockTime(25 * 60 + 57)} on weekdays.`} /></> },
  { hour: 6, slot: slotOf(6, true), text: <><DevPlaceholder what="first buses back" /> At {hourTime(5)}, {downtownAt(5)} of {TOTAL} airports have a ride downtown within the hour. At {hourTime(6)}, {downtownAt(6)} do.</> },
];

function StorySection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-[48rem]">
      <h2 id={id} className={STORY_HEADING}>{heading}</h2>
      {children}
    </section>
  );
}

/** The map's basemap follows the reader's theme: 0 (light) or 1 (dark). */
const pageIsLight = () => document.documentElement.getAttribute('data-theme') !== 'dark';

export default function AirportStory() {
  /** The hour slot the scroll has reached: 0 at 6 AM, 24 at the closing 6 AM. */
  const [hourIndex, setHourIndex] = useState(0);
  const [night, setNight] = useState(() => (pageIsLight() ? 0 : 1));
  const hourStepRefs = useRef<Array<HTMLDivElement | null>>([]);

  // The Frequent service story's steps (FrequentServiceStory): one invisible step per hour after the sticky map, and the
  // furthest step on screen sets the hour. Each hour is a plain switch, so a reader who has turned off motion sees no
  // animation here (the map's fly-ins jump for them too).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibleSteps = new Set<number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const step = Number((entry.target as HTMLElement).dataset.hourStep);
        if (entry.isIntersecting) visibleSteps.add(step);
        else visibleSteps.delete(step);
      });
      setHourIndex(Math.max(...visibleSteps, 0));
    }, { threshold: 0.35 });
    hourStepRefs.current.forEach(step => { if (step) observer.observe(step); });
    return () => observer.disconnect();
  }, []);

  // The map's basemap follows the reader's theme when it changes.
  useEffect(() => {
    const theme = new MutationObserver(() => setNight(pageIsLight() ? 0 : 1));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => theme.disconnect();
  }, []);

  const { colorVisionFriendly } = useColorVision();
  const hour = HOURS[hourIndex];
  const current = [...STEPS].reverse().find(s => s.slot <= hourIndex) ?? STEPS[0];
  // A zoom holds from its hour's slot until its `until` slot (the first one after it).
  const zoom = ZOOMS.find(z => hourIndex >= slotOf(z.hour) && hourIndex < slotOf(z.until))?.code ?? null;

  const method = (
    <ResearchMethod parts={{
      dateConducted: <>{longDate(AIRPORT_STORY_CONDUCTED)}.</>,
      sample: <>the 157 passenger airports with scheduled airline service in the cities Atlas covers in Canada and the United States, matched by stop names and distance from published airport locations.</>,
      sources: <>each agency’s own schedule data (GTFS), for Tuesday November 17, Saturday November 21 and Sunday November 22, 2026. Flight times come from published schedules for nearby dates in November 2026.</>,
      whatCounted: <>a departure counts when the same vehicle later stops within 1.2 km of downtown (city hall or the main downtown transit hub). Landable hours are the hours of the week when a departure leaves within 60 minutes of landing at the start of that hour.</>,
      rechecked: <>every airport with no direct ride was checked by hand against the airport’s and agency’s own websites.</>,
      limitations: <>only public transit in agency schedule data is counted. Airport-run and private shuttles are not. LAX FlyAway (about 5 AM to 11 PM to Union Station) has no current schedule data, so it is noted but not measured. On-demand services, such as Waterloo’s route 79, are noted but not measured. Newark’s round-the-clock result is for downtown Newark; Manhattan needs a change. Flight schedules change by season.</>,
    }} />
  );

  return (
    <PageShell method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          width="story"
          title={devPlaceholder('title')}
          intro={<>{AIRPORT_STORY_DRAFT.intro!({}).map(text => <p key={text}>{text}</p>)}</>}
        />

        {/* Morning to overnight, hour by hour with scroll, in the reader's own theme (the Frequent service story's layout). */}
        <section aria-label="One weekday at the airports" className="relative left-1/2 mt-24 w-screen -translate-x-1/2 px-2 sm:mt-32 sm:px-3">
          <div className="relative min-w-0 pb-[12vh]">
            <div className="sticky top-16 min-w-0 lg:top-24">
              <AirportStoryMap day="wk" hour={hour} night={night} zoom={zoom} colorMode={colorVisionFriendly ? 'friendly' : 'default'}>
                <p className={STEP_TEXT} aria-live="polite">{current.text}</p>
              </AirportStoryMap>
            </div>
            {/* One step per hour, 18vh apart, and the Frequent service story's hold after the last one. */}
            <div className="relative z-10 space-y-[12vh] pb-[60vh] pt-8" aria-hidden="true">
              {HOURS.map((_, i) => <div key={i} ref={step => { hourStepRefs.current[i] = step; }} data-hour-step={i} className="h-[6vh]" />)}
            </div>
          </div>
        </section>

        <div className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          {/* The week grid stays further down (Ryan's pick, 2026-11-16); the chart itself is not built yet. */}
          <StorySection id="airport-week-heading" heading={devPlaceholder('week grid heading')}>
            <DevPlaceholder as="p" className={PLACEHOLDER} what="chart later: week grid per airport, with real scheduled flights marked at featured airports" />
          </StorySection>

          <StorySection id="airport-weekend-heading" heading="The weekend gap">
            <p className={STORY_PARAGRAPH}>16 airports have no transit at all on Saturday, and 44 have none on Sunday.</p>
          </StorySection>

          <StorySection id="airport-downtown-heading" heading="Not quite downtown">
            <p className={STORY_PARAGRAPH}>21 airports have no direct ride downtown. At most of them, a bus or train takes you to a rail line, where you change. That includes some of the biggest: JFK, LaGuardia, Phoenix and Miami. At Los Angeles, a direct bus runs only overnight; by day, riders change at the Metro transit center, which is off the terminal loop.</p>
          </StorySection>

          <StorySection id="airport-far-heading" heading="How far you can get">
            <p className={STORY_PARAGRAPH}>From some airports, one ride goes a long way. The bus from Grand Junction’s airport reaches Denver Union Station, 311 km away, six times a day. From Newark, a bus reaches Toms River, 83 km away.</p>
          </StorySection>

          <StorySection id="airport-find-heading" heading="Find your airport">
            <DevPlaceholder as="p" className={PLACEHOLDER} what="existing link to the map" />
          </StorySection>
        </div>
      </article>
    </PageShell>
  );
}
