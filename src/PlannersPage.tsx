import type { ReactNode } from 'react';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { headwayEvery } from '../shared/headwayText';
import { PAGE_NAMES } from '../shared/pageNames';
import { FEATURES } from '../shared/config';
import { LIVE_VEHICLES_TITLE, OPEN_LIVE_LABEL } from '../shared/liveWording';
import { DOCS_PATH, LIVE_PATH } from '../shared/pagePaths';
import { titleCase } from '../shared/titleCase';
import { MAP_LINK, READ_HOW_ATLAS_WORKS } from './content/noticeCopy';
import FeatureCard from './components/FeatureCard';
import RequestDemoCard from './components/RequestDemoCard';
import { coverageAgenciesText, coverageCountriesText } from '../shared/atlasCoverage';

/**
 * "For Transit Planners" (CIV-1320). Titles are title case (DECISIONS.md, 2026-11-15); the rest is sentence case. Text is Ryan's OK'd draft, word for word ("wording is ok until i see the actual
 * built draft", 2026-11-06). Layout follows the About page: the wide column, the hero beside the map picture, and pale
 * frequency-colour tints for the feature cards.
 */


/** A map picture with a light and a dark version, as on About (index.css, .theme-light-only). Decorative: the text says what it shows. */
function ThemedPicture({ base, ext, className }: { base: string; ext: string; className: string }) {
  return (
    <>
      <img src={`${base}-light.${ext}`} alt="" className={`theme-light-only ${className}`} />
      <img src={`${base}-dark.${ext}`} alt="" className={`theme-dark-only ${className}`} />
    </>
  );
}

const Feature = FeatureCard;

const PICTURE = 'block aspect-[4/3] w-full rounded-xl border border-[var(--border-primary)] object-cover';
const pic = (name: string) => `/assets/planners/${name}`;

/**
 * A feature card's picture (CIV-1701): a faded real map with the card's own app control, trimmed to a couple of rows.
 * Every card's picture is 4:3, so the cards line up; phones get their own smaller version so the control's rows still
 * read. Made by scripts/planner-pictures/capture.mts.
 */
function CardPicture({ name }: { name: string }) {
  return (
    <>
      {(['light', 'dark'] as const).map(theme => (
        <picture key={theme} className={`block ${theme === 'light' ? 'theme-light-only' : 'theme-dark-only'}`}>
          <source media="(max-width: 639px)" srcSet={pic(`card-${name}-phone-${theme}.webp`)} />
          <img src={pic(`card-${name}-desktop-${theme}.webp`)} alt="" className={PICTURE} />
        </picture>
      ))}
    </>
  );
}

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
        <Feature title="See Frequency, Not Just Routes" color={color(0)} pictures={<CardPicture name="frequency" />}>
          <p>Every route is coloured by its headway: every 10, 15, 20, 30 or 60 min, or less often. Pick a tier and Atlas shows only the routes that meet it, so a frequent network map takes one click. The tiers make it quick to check a network against your own service frequency standards.</p>
        </Feature>
        <Feature title="See How Service Changes Over the Day and Week" color={color(1)} pictures={<CardPicture name="dayweek" />}>
          <p>Frequency on a map is only half the story. Switch between weekday, Saturday and Sunday, then pick a time of day: AM peak, midday, PM peak, evening, late night or overnight (2 to 6 AM), so peak, off-peak and owl service each get their own map.</p>
          <p>Weekday midday and Sunday evening are often very different networks. Atlas shows both, and Compare puts two of them side by side on desktop.</p>
          <p>Open any route to see an hourly chart of its headways, which also shows its span of service.</p>
        </Feature>
        <Feature title="Every Agency in a Region, on One Map" color={color(2)} pictures={<CardPicture name="agency" />}>
          <p>Riders don’t care which agency runs the bus. Atlas puts every agency it covers on the same map, so you can see where local, regional and intercity services meet, and where they don’t. Use the agency filter to focus on one operator, or leave it on All to see the whole region.</p>
          <p>This helps you spot weak connections between agencies: a hub where one agency runs {headwayEvery(10)} and the other once an hour, or a town where an intercity route stops but no local bus runs in the evening.</p>
          <p>Each agency also has its own page with a summary of its routes and the agencies nearby.</p>
        </Feature>
        <Feature title="A Map Instead of a Long Report" color={color(3)} pictures={<CardPicture name="export" />}>
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
        <p>Atlas covers {coverageAgenciesText()} transit agencies in {coverageCountriesText()}. It reads each agency’s published GTFS feed and checks for updates every week, so a service change shows up soon after the agency publishes it. If an agency’s schedule has run out, Atlas says so on the map.</p>
        {/* CIV-1724: About's Docs link, to the Docs section on where the data comes from and how it's checked. */}
        <ArrowLink href={`${DOCS_PATH}#data-flow`}>{READ_HOW_ATLAS_WORKS}</ArrowLink>
      </TextSection>

      {/* CIV-1706 (Ryan, 2026-11-15): the page ends with one ask, this button, with no line above it. It replaces the
          "Get in Touch" section. Ryan, 2026-11-16: it's a feature card, the shared Request a demo card. */}
      <div className="pb-16 sm:pb-20">
        <RequestDemoCard color={color(5)} />
      </div>

    </PageShell>
  );
}
