import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Clock, MapPin, Repeat } from 'lucide-react';
import { FEATURES } from '../shared/config';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import Tag from './components/ui/Tag';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import { SURFACE } from './styles';
import { newestResearch, type ResearchEntry } from './data/research';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';

/** "Explore our research" (Ryan) shows the newest research, so a new page appears here without editing this one (CIV-1205). */
const KEEP_LOOKING_COUNT = 3;

/** The stories sit slightly tilted, like stickers (CIV-1206 D); each straightens on hover or keyboard focus. */
const STORY_TILT = [-1.5, 1, -0.75];

/** Where / When / How often, each on a pale tint of one frequency colour with its icon in that colour (CIV-1206 D). */
const QUESTIONS = [
  { title: 'Where', body: 'See the routes and places connected by a network.', Icon: MapPin },
  { title: 'When', body: 'See what still runs in the morning, evening, or overnight.', Icon: Clock },
  { title: 'How often', body: 'Compare scheduled frequency without opening a schedule.', Icon: Repeat },
];

/** A pale tint of a frequency colour on the page background: never a dark fill (STYLE.md). */
const tint = (color: string) => `color-mix(in srgb, ${color} 11%, var(--bg-app))`;

/** A picture with a light and a dark version; CSS shows the current theme's (index.css, .theme-light-only). */
function ThemedPicture({ base, ext, className }: { base: string; ext: string; className: string }) {
  return (
    <>
      <img src={`${base}-light.${ext}`} alt="" className={`theme-light-only ${className}`} />
      <img src={`${base}-dark.${ext}`} alt="" className={`theme-dark-only ${className}`} />
    </>
  );
}

/** A story tile: its share picture on top, then the research card's tag, title, description and link (as on /research). */
function StoryTile({ entry, tilt }: { entry: ResearchEntry; tilt: number }) {
  return (
    <a href={entry.href} className={`${SURFACE} group flex w-full flex-col overflow-hidden rounded-2xl transition-[rotate] [rotate:var(--tilt)] hover:rotate-0 focus-visible:rotate-0`} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <ThemedPicture base={entry.picture} ext="svg" className="block aspect-[1200/630] w-full object-cover" />
      <div className="flex flex-1 flex-col p-5">
        <Tag className="self-start">{entry.kind}</Tag>
        <SectionTitle level="item" className="mt-3">{entry.title}</SectionTitle>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{entry.body}</p>
        {/* Pinned to the bottom so the links line up across the row, as on /research. */}
        <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-auto self-start pt-4">{entry.linkText}</ArrowLink>
      </div>
    </a>
  );
}

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
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency, and place.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ArrowLink href="/">Try Atlas</ArrowLink>
              {FEATURES.researchApps && <a href="/research" className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">Explore research</a>}
            </div>
          </div>
          <ThemedPicture base="/assets/about/atlas-routes-toronto" ext="webp" className="block aspect-[10/9] w-full rounded-2xl border sm:aspect-[16/9] lg:aspect-[10/9] border-[var(--border-primary)] object-cover" />
        </section>

        {FEATURES.researchApps && <section className="border-b border-[var(--border-primary)] py-16">
          <h2 id="research-heading" className="text-3xl font-black tracking-tight sm:text-4xl">Explore our research</h2>
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
                <StoryTile entry={entry} tilt={STORY_TILT[i % STORY_TILT.length]} />
              </div>
            ))}
          </div>
        </section>}

        <section className="py-16 sm:py-20" aria-label="What Atlas shows">
          <h2 id="questions-heading" className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Understand the network beyond the route map.</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {QUESTIONS.map(({ title, body, Icon }, i) => {
              const color = tiers[i].color;
              return (
                <div key={title} className="rounded-2xl p-6" style={{ background: tint(color) }}>
                  <Icon className="h-7 w-7" style={{ color }} aria-hidden="true" />
                  <h3 className="mt-5 text-2xl font-black tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <h2 className="max-w-xs text-2xl font-black tracking-tight">Built for looking closer.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>Atlas brings published agency schedules into one place so riders, planners, researchers, and advocates can compare routes across cities, time periods, and modes.</p>
            <p>It does not replace official trip planning or live alerts. It makes the patterns in scheduled service easier to see.</p>
            <ArrowLink href="/about/docs">Read how Atlas works</ArrowLink>
          </div>
        </section>

    </PageShell>
  );
}
