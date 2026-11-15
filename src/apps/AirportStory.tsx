import type { ReactNode } from 'react';
import { longDate } from '../../shared/dateText';
import ResearchMethod from '../components/research/ResearchMethod';
import ResearchHeader from '../components/research/ResearchHeader';
import PageShell from '../components/ui/PageShell';

/**
 * CIV-1550: the airport story, local dev only (main.tsx registers it under import.meta.env.DEV, so it is in no built
 * bundle). Text is editorial/drafts/civ1550-airport-story-draft-2026-11-15.md word for word, a draft for Ryan's review;
 * nothing here is approved yet. No charts: each "[Chart later…]" is a dim placeholder line.
 */

/** The story's section headings and body paragraphs, the Frequent service story's look. */
const STORY_HEADING = 'text-3xl sm:text-4xl font-black tracking-tight';
const STORY_PARAGRAPH = 'mt-5 text-base leading-8 text-[var(--text-muted)]';
const STORY_LIST = 'mt-5 list-disc space-y-2 pl-6 text-base leading-8 text-[var(--text-muted)]';
const PLACEHOLDER = 'mt-5 text-xs leading-5 text-[var(--text-dim)]';

const AIRPORT_STORY_CONDUCTED = '2026-11-14';

/** A draft's "Focus rule:" note, shown in place so Ryan reads it in context. Dev-only, like the page. */
function EditorsNote({ children }: { children: string }) {
  return (
    <p className="mt-5 border-l-2 border-[var(--border-primary)] pl-3 text-xs leading-5 text-[var(--text-dim)]">
      <strong>Editor’s note:</strong> {children}
    </p>
  );
}

function StorySection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mx-auto w-full max-w-[48rem]">
      <h2 id={id} className={STORY_HEADING}>{heading}</h2>
      {children}
    </section>
  );
}

export default function AirportStory() {
  const method = (
    <ResearchMethod parts={{
      dateConducted: <>{longDate(AIRPORT_STORY_CONDUCTED)}.</>,
      sample: <>the 157 passenger airports with scheduled airline service in the cities Atlas covers in Canada and the United States, matched by stop names and distance from published airport locations.</>,
      sources: <>each agency's own schedule data (GTFS), for Tuesday November 17, Saturday November 21 and Sunday November 22, 2026. Flight times come from published schedules for nearby dates in November 2026.</>,
      whatCounted: <>a departure counts when the same vehicle later stops within 1.2 km of downtown (city hall or the main downtown transit hub). Landable hours are the hours of the week when a departure leaves within 60 minutes of landing at the start of that hour.</>,
      rechecked: <>every airport with no direct ride was checked by hand against the airport's and agency's own websites.</>,
      limitations: <>only public transit in agency schedule data is counted. Airport-run and private shuttles are not. LAX FlyAway (about 5 AM to 11 PM to Union Station) has no current schedule data, so it is noted but not measured. On-demand services, such as Waterloo's route 79, are noted but not measured. Newark's round-the-clock result is for downtown Newark; Manhattan needs a change. Flight schedules change by season.</>,
    }} />
  );

  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          width="story"
          title="[Ryan's wording: title]"
          intro={<>
            <p>You land, walk out of the terminal and look for the bus. Whether one is coming depends on which airport you landed at, and when.</p>
            <p>We checked the 157 passenger airports in the cities Atlas covers in Canada and the United States. For each one, we counted the hours of the week when a bus or train leaves for downtown within an hour of landing.</p>
          </>}
        />

        <div className="mx-auto mt-24 max-w-4xl space-y-24 sm:mt-32 sm:space-y-32">
          <StorySection id="airport-landed-heading" heading="You just landed">
            <p className={STORY_PARAGRAPH}>Pick an airport to see its week. Each square is an hour. It's filled in when a bus or train leaves for downtown within 60 minutes of landing at the start of that hour.</p>
            <p className={PLACEHOLDER}>[Chart later: week grid per airport, with real scheduled flights marked at featured airports.]</p>
            <p className={STORY_PARAGRAPH}>Some pairs from the schedules:</p>
            <ul className={STORY_LIST}>
              <li>In Montréal, a Jazz flight from Toronto lands at 1:56 AM, and the 747 bus leaves at 1:57 AM.</li>
              <li>In Regina, a WestJet flight from Calgary lands at 10:35 AM on a Tuesday. The next bus downtown is at 4:15 PM.</li>
              <li>In Omaha, a Southwest flight from Dallas lands at 10:55 AM on a Saturday. The next bus downtown is on Monday at 5:38 AM.</li>
            </ul>
            <EditorsNote>Focus rule: these three pairs name three cities; a Toronto version would lead with a Pearson pair and keep one contrast.</EditorsNote>
          </StorySection>

          <StorySection id="airport-clock-heading" heading="Around the clock">
            <p className={STORY_PARAGRAPH}>Only 6 airports have a direct ride downtown within an hour at every hour of the week: Newark, Las Vegas, Chicago Midway, Chicago O'Hare, San Francisco and Montréal. Allowing one change, 11 do, including Toronto Pearson. 16 airports have some transit leaving within an hour at every hour, though not always toward downtown.</p>
            <p className={STORY_PARAGRAPH}>That leaves 141 airports where, at some hour of the week, you land and nothing leaves within the hour.</p>
          </StorySection>

          <StorySection id="airport-weekend-heading" heading="The weekend gap">
            <p className={STORY_PARAGRAPH}>16 airports have no transit at all on Saturday, and 44 have none on Sunday.</p>
          </StorySection>

          <StorySection id="airport-midday-heading" heading="The midday hole">
            <p className={STORY_PARAGRAPH}>At some airports the bus runs only around rush hour. In Regina, buses leave for downtown every 20 minutes until 8:55 AM, then none until 4:15 PM, and none on weekends. Omaha's only bus leaves at 9:08 AM and then not again until 3:38 PM. Worcester's airport is served only from 1:22 PM to 6:22 PM on weekdays.</p>
            <EditorsNote>Focus rule: three cities again; keep the strongest one (Regina) in prose and put the rest in the chart.</EditorsNote>
          </StorySection>

          <StorySection id="airport-downtown-heading" heading="Not quite downtown">
            <p className={STORY_PARAGRAPH}>21 airports have no direct ride downtown. At most of them, a bus or train takes you to a rail line, where you change. That includes some of the biggest: JFK, LaGuardia, Phoenix and Miami. At Los Angeles, a direct bus runs only overnight; by day, riders change at the Metro transit center, which is off the terminal loop.</p>
          </StorySection>

          <StorySection id="airport-far-heading" heading="How far you can get">
            <p className={STORY_PARAGRAPH}>From some airports, one ride goes a long way. The bus from Grand Junction's airport reaches Denver Union Station, 311 km away, six times a day. From Newark, a bus reaches Toms River, 83 km away.</p>
          </StorySection>

          <StorySection id="airport-find-heading" heading="Find your airport">
            <p className={PLACEHOLDER}>[Existing link to the map.]</p>
          </StorySection>
        </div>
      </article>
    </PageShell>
  );
}
