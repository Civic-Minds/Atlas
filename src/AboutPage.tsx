import { useEffect, useRef, useState } from 'react';
import Card, { CARD_TITLE } from './components/ui/Card';
import ResearchTile from './components/ResearchTile';
import ThemedPicture from './components/ui/ThemedPicture';
import { Clock, MapPin, Repeat } from 'lucide-react';
import { FEATURE_ROUTES, FEATURES } from '../shared/config';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { newestResearch } from './data/research';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { DOCS_PATH } from '../shared/pagePaths';
import { MAP_LINK, READ_HOW_ATLAS_WORKS, EXPLORE_RESEARCH_LABEL, WHAT_ATLAS_SHOWS_LABEL } from './content/noticeCopy';

/** "Explore our research" (Ryan) shows the newest research, so a new page appears here without editing this one (CIV-1205). */
const KEEP_LOOKING_COUNT = 3;

/** The stories sit slightly tilted, like stickers (CIV-1206 D); each straightens on hover or keyboard focus. */
const STORY_TILT = [-1.5, 1, -0.75];
/** Which frequency colour each of Where / When / How often takes (CIV-1789): the first, third and fourth tiers. */
const QUESTION_TIERS = [0, 2, 3];

/** Where / When / How often, each on a pale tint of one frequency colour with its icon in that colour (CIV-1206 D). */
const QUESTIONS = [
  { title: 'Where', body: 'See the routes and places connected by a network.', Icon: MapPin },
  { title: 'When', body: 'See what still runs in the morning, evening or overnight.', Icon: Clock },
  { title: 'How often', body: 'Compare scheduled frequency without opening a schedule.', Icon: Repeat },
];


/** True while the box is wider inside than out: only then is the story row a scroller worth a keyboard stop. */
function useOverflows<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Wider screens show the row unscrolled (overflow visible), where the tilted tiles' corners alone would count as overflow.
    const check = () => setOverflows(getComputedStyle(el).overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, overflows };
}

export default function AboutPage() {
  const tiers = useHeadwayTiers();
  const stories = useOverflows<HTMLDivElement>();
  return (
    <PageShell variant="wide">

        {/* The headline beside a picture of the map (CIV-1206 D, Ryan: "a picture of the Atlas map beside the headline"):
            Toronto's routes in their frequency colours, without the base map's street names. */}
        <section className="grid gap-12 border-b border-[var(--border-primary)] pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
          <div>
            <PageTitle level="hero">Find the transit service that actually runs.</PageTitle>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency and place.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ArrowLink href="/">{MAP_LINK}</ArrowLink>
              {FEATURES.researchApps && <a href={FEATURE_ROUTES.research} className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">{EXPLORE_RESEARCH_LABEL}</a>}
            </div>
          </div>
          <ThemedPicture base="/assets/about/atlas-routes-toronto" ext="webp" className="block aspect-[10/9] w-full rounded-2xl border sm:aspect-[16/9] lg:aspect-[10/9] border-[var(--border-primary)] object-cover" />
        </section>

        {FEATURES.researchApps && <section className="border-b border-[var(--border-primary)] py-16">
          <h2 id="research-heading" className="text-3xl font-black tracking-tight sm:text-4xl">Explore Our Research</h2>
          {/* Phones: one row to swipe, the next story peeking at the edge and each snapping into place (Ryan: "a carousel").
              While it scrolls it is a keyboard stop, so the arrow keys move it; wider screens show the stories three across.
              The row, not the section, is the landmark named by the heading, so it is announced once. */}
          <div
            ref={stories.ref}
            role="region"
            aria-labelledby="research-heading"
            tabIndex={stories.overflows ? 0 : undefined}
            className="-mx-6 mt-10 flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 py-3 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-8 sm:overflow-visible sm:px-0 sm:py-0"
          >
            {newestResearch(KEEP_LOOKING_COUNT).map((entry, i) => (
              <div key={entry.href} className="flex w-[80%] shrink-0 snap-start sm:w-auto">
                <ResearchTile entry={entry} tilt={STORY_TILT[i % STORY_TILT.length]} />
              </div>
            ))}
          </div>
        </section>}

        <section className="py-16 sm:py-20" aria-label={WHAT_ATLAS_SHOWS_LABEL}>
          <h2 id="questions-heading" className="max-w-2xl text-balance text-3xl font-black tracking-tight sm:text-4xl">Understand the network beyond the route map.</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {QUESTIONS.map(({ title, body, Icon }, i) => {
              // CIV-1789 (Ryan's pick): three frequency colours in order, as on the planners cards.
              const color = tiers[QUESTION_TIERS[i]].color;
              return (
                <Card key={title} tone={{ tint: color }} padding="regular">
                  <Icon className="h-9 w-9" strokeWidth={2.25} style={{ color }} aria-hidden="true" />
                  <h3 className={`mt-4 ${CARD_TITLE}`}>{title}</h3>
                  <p className="mt-2 text-base leading-7 text-[var(--text-secondary)]">{body}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <h2 className="max-w-xs text-2xl font-black tracking-tight">Built for looking closer.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>Atlas brings published agency schedules into one place so riders, planners, researchers and advocates can compare routes across cities, time periods and modes.</p>
            <p>It does not replace official trip planning or live alerts. It makes the patterns in scheduled service easier to see.</p>
            <ArrowLink href={DOCS_PATH}>{READ_HOW_ATLAS_WORKS}</ArrowLink>
          </div>
        </section>

    </PageShell>
  );
}
