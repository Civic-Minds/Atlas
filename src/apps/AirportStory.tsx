import { useEffect, useRef, useState, type ReactNode } from 'react';
import { applyNightBlend, clearNightBlend } from '../lib/nightBlend';
import { longDate } from '../../shared/dateText';
import { clockTime, hourTime } from '../../shared/timeText';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import PageShell from '../components/ui/PageShell';
import AirportStoryMap, { ZOOMS } from '../components/AirportStoryMap';
import { AIRPORTS, landableAt, landableCount } from '../data/airportHourly';
import { useColorVision } from '../context/ColorVisionContext';
import { AIRPORT_STORY_DRAFT } from '../../shared/researchStories';

/**
 * CIV-1550: the airport story, local dev only (main.tsx registers it under import.meta.env.DEV, so it is in no built
 * bundle). A scroll story on the Frequent service story's pattern: a sticky map of the 157 airports through one weekday,
 * 6 AM to 6 AM the next morning hour by hour with scroll, with the scroll section (and the sticky site header while it is
 * over the section) blending from the reader's light tokens to Atlas's dark tokens between 7 PM and 11 PM, and back to
 * light between 4 AM and 6 AM. The hours after midnight use the same weekday's masks (Tuesday stands for every
 * weekday), so the closing 6 AM shows the opening 6 AM's airports. All text is a draft
 * for Ryan's review; nothing here is approved yet. Counts come from src/data/airport-hourly.json.
 */

/** The story's section headings and body paragraphs, the Frequent service story's look. */
const STORY_HEADING = 'text-3xl sm:text-4xl font-black tracking-tight';
const STORY_PARAGRAPH = 'mt-5 text-base leading-8 text-[var(--text-muted)]';
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
 * The weekday's text cards. Each shows from its slot until the next card's; the background blends from 7 PM to 11 PM
 * and back from 4 AM to 6 AM. Memphis (CIV-1550 draft contrast): of the large airports, the one whose last weekday bus
 * downtown leaves earliest (route 28, 4:34 PM, a constant from the study: the data holds hours, not minutes). Oakland's
 * earlier last trip is left out: its only direct rides are overnight buses, and BART runs all day with a change.
 */
const STEPS: { hour: number; slot: number; text: ReactNode }[] = [
  { hour: 6, slot: slotOf(6), text: <>It’s {hourTime(6)}. At {downtownAt(6)} of {TOTAL} airports, a bus or train leaves for downtown within the hour.</> },
  { hour: 11, slot: slotOf(11), text: <>[Ryan’s wording: Memphis midday gap.] At Memphis, no bus leaves the airport in the {MEMPHIS_GAP.map(h => hourTime(h)).join(' and ')} hours. The last bus downtown leaves at {clockTime(16 * 60 + 34)}.</> },
  { hour: 19, slot: slotOf(19), text: <>{downtownAt(19)} airports still have a ride downtown within the hour. One by one, the last buses leave. [Ryan’s wording: 7 PM, count drops or another airport.]</> },
  { hour: 23, slot: slotOf(23), text: <>At {hourTime(23)}, {downtownAt(23)} airports have a ride downtown within the hour. At Pearson, the UP Express to Union Station runs until {clockTime(24 * 60 + 54)}.</> },
  // The 747 meets 1:57 AM only on Saturday and Sunday; on the weekday it leaves at 1:41 and 2:33 AM (route 356 at 1:57 AM).
  { hour: 3, slot: slotOf(3), text: <>At {hourTime(3)}, only {landableCount(AIRPORTS, 'wk', 3, 'any')} airports have any transit within the hour, and {downtownAt(3)} go straight downtown. [Ryan’s wording: Montréal pair. On weekdays the 747 leaves at {clockTime(25 * 60 + 41)} and {clockTime(26 * 60 + 33)}; it leaves at {clockTime(25 * 60 + 57)} only on Saturday and Sunday. Route 356 leaves for downtown at {clockTime(25 * 60 + 57)} on weekdays.]</> },
  { hour: 6, slot: slotOf(6, true), text: <>[Ryan’s wording: first buses back.] At {hourTime(5)}, {downtownAt(5)} of {TOTAL} airports have a ride downtown within the hour. At {hourTime(6)}, {downtownAt(6)} do.</> },
];

function StorySection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-[48rem]">
      <h2 id={id} className={STORY_HEADING}>{heading}</h2>
      {children}
    </section>
  );
}

/** The evening blend to dark, 7 PM to 11 PM, and the morning blend back to light, 4 AM to the closing 6 AM. */
const NIGHT_FROM = slotOf(19);
const NIGHT_TO = slotOf(23);
const DAWN_FROM = slotOf(4);
const DAWN_TO = slotOf(6, true);
/** Night progress at a scroll position: 0 by day, rising to 1 by 11 PM and back to 0 by the closing 6 AM. */
const nightAt = (pos: number) => clamp01((pos - NIGHT_FROM) / (NIGHT_TO - NIGHT_FROM)) - clamp01((pos - DAWN_FROM) / (DAWN_TO - DAWN_FROM));
/** Scroll per hour, in viewport heights, and the hold after the closing 6 AM before the section scrolls away (the spacer's height). */
const SLOT_VH = 18;
const HOLD_VH = 45;
const pageIsLight = () => document.documentElement.getAttribute('data-theme') !== 'dark';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function AirportStory() {
  /** Position through the hours: 0 at 6 AM, 24 at the closing 6 AM, fractional between. */
  const [position, setPosition] = useState(0);
  const [night, setNight] = useState(() => (pageIsLight() ? 0 : 1));
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // One rAF-throttled scroll handler: the hour position comes from how far the map's container has scrolled past the
  // map's pinned top, and the night progress from that position between the 7 PM and 11 PM slots and back between the
  // 4 AM and closing 6 AM slots (with reduced motion, a plain switch to dark at 7 PM and back to light at the closing 6 AM). The blended tokens go on the section and, while the sticky site header sits over the section, on the header.
  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!section || !track || !sticky) return;
    const header = document.querySelector<HTMLElement>('[data-page-header]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      const slot = (window.innerHeight * SLOT_VH) / 100;
      const pinnedTop = parseFloat(getComputedStyle(sticky).top) || 0;
      const pos = Math.min(HOURS.length - 1, Math.max(0, (pinnedTop - track.getBoundingClientRect().top) / slot));
      setPosition(pos);
      if (!pageIsLight()) {
        clearNightBlend(section);
        if (header) clearNightBlend(header);
        setNight(1);
        return;
      }
      const p = reduced.matches ? (pos >= NIGHT_FROM && pos < DAWN_TO ? 1 : 0) : nightAt(pos);
      setNight(p);
      applyNightBlend(section, p);
      if (header) {
        const h = header.getBoundingClientRect();
        const s = section.getBoundingClientRect();
        if (s.top < h.bottom && s.bottom > h.top) applyNightBlend(header, p);
        else clearNightBlend(header);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reduced.addEventListener('change', schedule);
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-color-vision'] });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reduced.removeEventListener('change', schedule);
      theme.disconnect();
      clearNightBlend(section);
      if (header) clearNightBlend(header);
    };
  }, []);

  const { colorVisionFriendly } = useColorVision();
  const hourIndex = Math.floor(position);
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
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          width="story"
          title={AIRPORT_STORY_DRAFT.heading}
          intro={<>{AIRPORT_STORY_DRAFT.intro!({}).map(text => <p key={text}>{text}</p>)}</>}
        />

        {/* Day to night and back, hour by hour with scroll: the section's tokens blend from light to dark between 7 PM and
            11 PM and back between 4 AM and 6 AM (lib/nightBlend), with plain switches at 7 PM and the closing 6 AM under
            reduced motion. A reader already in dark mode sees no change. */}
        <section
          ref={sectionRef}
          aria-label="One weekday at the airports"
          className="relative left-1/2 mt-24 w-screen -translate-x-1/2 bg-[var(--bg-app)] px-2 py-12 text-[var(--text-primary)] sm:mt-32 sm:px-3"
        >
          <div ref={trackRef} className="relative min-w-0">
            <div ref={stickyRef} className="sticky top-16 min-w-0 lg:top-24">
              <AirportStoryMap day="wk" hour={hour} night={night} zoom={zoom} colorMode={colorVisionFriendly ? 'friendly' : 'default'}>
                <p className={STEP_TEXT} aria-live="polite">{current.text}</p>
              </AirportStoryMap>
            </div>
            {/* 24 hour slots of SLOT_VH plus HOLD_VH: (25 - 1) * 18 + 45 = 477vh. */}
            <div aria-hidden="true" className="h-[477vh]" />
          </div>
        </section>

        <div className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
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
            <p className={PLACEHOLDER}>[Existing link to the map.]</p>
          </StorySection>
        </div>
      </article>
    </PageShell>
  );
}
