import type { ReactNode } from 'react';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { headwayEvery } from '../shared/headwayText';
import { PAGE_NAMES } from '../shared/pageNames';
import { FEATURES } from '../shared/config';
import { LIVE_VEHICLES_TITLE, OPEN_LIVE_LABEL } from '../shared/liveWording';
import { LIVE_PATH } from '../shared/pagePaths';
import { titleCase } from '../shared/titleCase';
import { MAP_LINK, REQUEST_DEMO_LABEL } from './content/noticeCopy';

/**
 * "For Transit Planners" (CIV-1320). Titles are title case (DECISIONS.md, 2026-11-15); the rest is sentence case. Text is Ryan's OK'd draft, word for word ("wording is ok until i see the actual
 * built draft", 2026-11-06). Layout follows the About page: the wide column, the hero beside the map picture, and pale
 * frequency-colour tints for the feature cards.
 */

const CONTACT_EMAIL = 'hey@ryanisnota.pro';

/** A pale tint of a frequency colour on the page background: never a dark fill (STYLE.md), as on About. */
const tint = (color: string) => `color-mix(in srgb, ${color} 11%, var(--bg-app))`;

/** A map picture with a light and a dark version, as on About (index.css, .theme-light-only). Decorative: the text says what it shows. */
function ThemedPicture({ base, ext, className }: { base: string; ext: string; className: string }) {
  return (
    <>
      <img src={`${base}-light.${ext}`} alt="" className={`theme-light-only ${className}`} />
      <img src={`${base}-dark.${ext}`} alt="" className={`theme-dark-only ${className}`} />
    </>
  );
}

function Email() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] hover:underline">{CONTACT_EMAIL}</a>;
}

/** A feature section: a tinted card, its heading and text beside its pictures (stacked on phones). */
function Feature({ title, color, pictures, children }: { title: string; color: string; pictures: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-8 rounded-2xl p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-10" style={{ background: tint(color) }}>
      <div>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        <div className="mt-3 space-y-3 text-base leading-7 text-[var(--text-muted)]">{children}</div>
      </div>
      <div>{pictures}</div>
    </section>
  );
}

const PICTURE = 'block w-full rounded-xl border border-[var(--border-primary)] object-cover';
const pic = (name: string) => `/assets/planners/${name}`;

/** A text section beside its heading, like About's "Built for looking closer." */
function TextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-[var(--border-primary)] py-12 sm:py-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
      <h2 className="max-w-xs text-2xl font-black tracking-tight">{title}</h2>
      <div className="space-y-4 text-base leading-7 text-[var(--text-muted)]">{children}</div>
    </section>
  );
}

const STRONG = 'font-bold text-[var(--text-primary)]';

export default function PlannersPage() {
  const tiers = useHeadwayTiers();
  const color = (i: number) => tiers[i % tiers.length].color;
  return (
    <PageShell variant="wide">

      <section className="grid gap-12 border-b border-[var(--border-primary)] pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <div>
          <PageTitle level="hero">{PAGE_NAMES.planners}</PageTitle>
          <p className={`mt-8 max-w-2xl text-lg leading-8 ${STRONG}`}>Atlas shows how often transit really runs, across every agency in a region, on one map.</p>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">Most transit maps show where routes go. Atlas shows headways and span of service: how often routes run, and when. It’s built for agency planners, consultants and city and regional staff who need to see service across a whole region, not one agency at a time.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ArrowLink href="/">{MAP_LINK}</ArrowLink>
          </div>
        </div>
        <ThemedPicture base={pic('hero')} ext="webp" className="block aspect-[10/9] w-full rounded-2xl border sm:aspect-[16/9] lg:aspect-[10/9] border-[var(--border-primary)] object-cover" />
      </section>

      <div className="grid gap-5 py-16 sm:py-20">
        <Feature title="See Frequency, Not Just Routes" color={color(0)} pictures={
          <div className="grid grid-cols-2 gap-3">
            <ThemedPicture base={pic('tiers-all')} ext="webp" className={`${PICTURE} aspect-square`} />
            <ThemedPicture base={pic('tiers-10')} ext="webp" className={`${PICTURE} aspect-square`} />
          </div>
        }>
          <p>Every route is coloured by its headway: every 10, 15, 20, 30 or 60 min, or less often. Pick a tier and Atlas shows only the routes that meet it, so a frequent network map takes one click. The tiers make it quick to check a network against your own service frequency standards.</p>
        </Feature>
        <Feature title="See How Service Changes Over the Day and Week" color={color(1)} pictures={
          <div className="space-y-3">
            <ThemedPicture base={pic('compare')} ext="webp" className={`${PICTURE} aspect-[1440/730]`} />
            <div className="grid grid-cols-2 items-start gap-3">
              <ThemedPicture base={pic('chicago')} ext="webp" className={`${PICTURE} aspect-[700/740]`} />
              <ThemedPicture base={pic('routecard')} ext="webp" className={`${PICTURE} aspect-[700/1078]`} />
            </div>
          </div>
        }>
          <p>Frequency on a map is only half the story. Switch between weekday, Saturday and Sunday, then pick a time of day: AM peak, midday, PM peak, evening, late night or overnight (2 to 6 AM), so peak, off-peak and owl service each get their own map.</p>
          <p>Weekday midday and Sunday evening are often very different networks. Atlas shows both, and Compare puts two of them side by side on desktop.</p>
          <p>Open any route to see an hourly chart of its headways, which also shows its span of service.</p>
        </Feature>
        <Feature title="Every Agency in a Region, on One Map" color={color(2)} pictures={
          <ThemedPicture base={pic('bayarea')} ext="webp" className={`${PICTURE} aspect-[740/700]`} />
        }>
          <p>Riders don’t care which agency runs the bus. Atlas puts every agency it covers on the same map, so you can see where local, regional and intercity services meet, and where they don’t. Use the agency filter to focus on one operator, or leave it on All to see the whole region.</p>
          <p>This helps you spot weak connections between agencies: a hub where one agency runs {headwayEvery(10)} and the other once an hour, or a town where an intercity route stops but no local bus runs in the evening.</p>
          <p>Each agency also has its own page with a summary of its routes and the agencies nearby.</p>
        </Feature>
        <Feature title="A Map Instead of a Long Report" color={color(3)} pictures={
          // The exported image looks the same in either theme.
          <img src={pic('export.webp')} alt="" className={`${PICTURE} aspect-[40/21]`} />
        }>
          <p>Existing-conditions work often ends up as a long report with a few static maps. Atlas gives you a map people can explore.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong className={STRONG}>Share links</strong> keep the view: the place, frequency tier, day, time of day, agencies and any open route or stop.</li>
            <li><strong className={STRONG}>Map images</strong> export with a source line, ready for a slide deck or a report.</li>
          </ul>
        </Feature>
        {/* CIV-1705: the Live card. No picture yet; its text is a placeholder until Ryan gives the words. */}
        <Feature title={titleCase(LIVE_VEHICLES_TITLE)} color={color(4)} pictures={null}>
          <p>[Placeholder, CIV-1705: Ryan’s words for the Live card]</p>
          {FEATURES.live && <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink>}
        </Feature>
      </div>

      <TextSection title="Where the Data Comes From">
        <p>Atlas covers about 700 transit agencies in Canada and the US. It reads each agency’s published GTFS feed and checks for updates every week, so a service change shows up soon after the agency publishes it. If an agency’s schedule has run out, Atlas says so on the map.</p>
      </TextSection>

      <TextSection title="What Atlas Doesn’t Do">
        <ul className="list-disc space-y-3 pl-5">
          <li><strong className={STRONG}>It shows the published schedule, not what actually ran.</strong> Delays, detours and cancellations aren’t included.</li>
          <li><strong className={STRONG}>It only covers agencies that publish GTFS.</strong> Some smaller agencies don’t.</li>
          <li><strong className={STRONG}>It can be wrong.</strong> Schedule data has errors, and so can Atlas. If something looks off for an agency you know, use the report button or email <Email />.</li>
          <li><strong className={STRONG}>It isn’t a trip planner.</strong> It shows the network, not how to get from A to B.</li>
        </ul>
      </TextSection>

      {/* CIV-1706 (Ryan, 2026-11-15): the page ends with one ask, this button, with no line above it. It replaces the
          "Get in Touch" section. The pill copies About's "Explore research" button. */}
      <div className="flex flex-wrap gap-3 pb-16 sm:pb-20">
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REQUEST_DEMO_LABEL)}`} className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">{REQUEST_DEMO_LABEL}</a>
      </div>

    </PageShell>
  );
}
