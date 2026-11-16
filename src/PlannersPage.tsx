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
import ThemedPicture from './components/ui/ThemedPicture';
import RequestDemoCard from './components/RequestDemoCard';
import { coverageAgenciesText, coverageCountriesText } from '../shared/atlasCoverage';

/**
 * "For Transit Planners" (CIV-1320). Titles are title case (DECISIONS.md, 2026-11-15); the rest is sentence case. Text is Ryan's OK'd draft ("wording is ok until i see the actual built draft",
 * 2026-11-06), trimmed to two sentences per feature card so every card carries about the same text (CIV-1767, waiting on
 * Ryan's OK). Layout follows the About page: the wide column, the hero beside the map picture, and pale
 * frequency-colour tints for the feature cards.
 */

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
        <FeatureCard title="See Frequency, Not Just Routes" color={color(0)} picture={pic('card-frequency')}>
          <p>Every route is coloured by its headway: every 10, 15, 20, 30 or 60 min, or less often. Pick a tier and Atlas shows only the routes that meet it, so a frequent network map, or a check against your own frequency standards, takes one click.</p>
        </FeatureCard>
        <FeatureCard title="See How Service Changes Over the Day and Week" color={color(1)} picture={pic('card-dayweek')} flip>
          <p>Switch between weekday, Saturday and Sunday, then pick a time of day from AM peak to overnight, so peak, off-peak and owl service each get their own map. Compare puts two of them side by side on desktop, and any route opens an hourly chart of its headways and span of service.</p>
        </FeatureCard>
        <FeatureCard title="Every Agency in a Region, on One Map" color={color(2)} picture={pic('card-agency')}>
          <p>Atlas puts every agency it covers on the same map, so you can spot weak connections, like a hub where one agency runs {headwayEvery(10)} and the other once an hour. Use the agency filter to focus on one operator, or leave it on All to see the whole region.</p>
        </FeatureCard>
        <FeatureCard title="A Map Instead of a Long Report" color={color(3)} picture={pic('card-export')} flip>
          <p>Existing-conditions work often ends up as a long report with a few static maps, but Atlas gives you a map people can explore. Share links keep the place, frequency tier, day, time of day, agencies and any open route or stop, and map images export with a source line, ready for a slide deck or a report.</p>
        </FeatureCard>
        {/* CIV-1705: the Live card. No picture yet; its text is a placeholder until Ryan gives the words. */}
        <FeatureCard title={titleCase(LIVE_VEHICLES_TITLE)} color={color(4)} picture={null}>
          <p>[Placeholder, CIV-1705: Ryan’s words for the Live card]</p>
          {FEATURES.live && <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink>}
        </FeatureCard>
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
