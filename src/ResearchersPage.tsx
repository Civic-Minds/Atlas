import type { ReactNode } from 'react';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { headwayEvery } from '../shared/headwayText';
import { PAGE_NAMES } from '../shared/pageNames';
import { DOCS_PATH } from '../shared/pagePaths';
import { ATLAS_INTRO_TEXT, MAP_LINK, READ_HOW_ATLAS_WORKS } from './content/noticeCopy';
import FeatureCard, { featureCardAsset } from './components/FeatureCard';
import ThemedPicture from './components/ui/ThemedPicture';
import RequestDemoCard from './components/RequestDemoCard';
import { coverageAgenciesText, coverageCountriesText } from '../shared/atlasCoverage';

/**
 * "For Researchers" (CIV-1709), built around History (Ryan, 2026-11-15: "things like history might be good for
 * researchers right", then 1). Local only, like the For Transit Planners page, until History goes public. It mirrors
 * PlannersPage: the same hero, shared feature cards with alternating picture sides, the same "Where the Data Comes From"
 * section and the shared Request a demo card at the end (Ryan, 2026-11-16). All card text is a draft waiting on Ryan's
 * word-for-word OK, two sentences per card, reusing About, Research, History and planners wording where it exists. Cards
 * with no picture yet pass null, like the planners Live card.
 */


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

export default function ResearchersPage() {
  const tiers = useHeadwayTiers();
  const color = (i: number) => tiers[i % tiers.length].color;
  return (
    <PageShell variant="wide">

      <section className="grid gap-12 border-b border-[var(--border-primary)] pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <div>
          <PageTitle level="hero">{PAGE_NAMES.researchers}</PageTitle>
          <p className={`mt-8 max-w-2xl text-lg leading-8 ${STRONG}`}>Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency and place.</p>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">{ATLAS_INTRO_TEXT}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ArrowLink href="/">{MAP_LINK}</ArrowLink>
          </div>
        </div>
        <ThemedPicture base={featureCardAsset('hero')} ext="webp" className="block aspect-[10/9] w-full rounded-2xl border sm:aspect-[16/9] lg:aspect-[10/9] border-[var(--border-primary)] object-cover" />
      </section>

      <div className="grid gap-5 py-16 sm:py-20">
        {/* History is beta only (FEATURES.history); no picture yet. */}
        <FeatureCard title="See How Service Changed Over the Years" color={color(0)} picture={null}>
          <p>History shows how scheduled transit service changed over time, using dated snapshots of agency schedules. Pick a year to see an agency’s routes as they ran then, and open a route to compare its oldest and newest weekday schedules, with the biggest changes first.</p>
        </FeatureCard>
        <FeatureCard title="Compare Cities on One Map" color={color(1)} picture={featureCardAsset('card-agency')} flip>
          <p>Atlas puts every agency it covers on the same map, so you can compare routes across cities, time periods and modes. Every route is coloured by its headway on the same scale, from {headwayEvery(10)} to {headwayEvery(60)} or less often, so a frequent route reads the same way in every city.</p>
        </FeatureCard>
        <FeatureCard title="Maps You Can Cite" color={color(2)} picture={featureCardAsset('card-export')}>
          <p>Map images export with a source line naming whose schedules are shown and when Atlas last updated its data, ready for a paper or a slide deck. Share links keep the place, frequency tier, day, time of day, agencies and any open route or stop, so readers open the same map you saw.</p>
        </FeatureCard>
      </div>

      <TextSection title="Where the Data Comes From">
        <p>Atlas covers {coverageAgenciesText()} transit agencies in {coverageCountriesText()}. It reads each agency’s published GTFS feed and checks for updates every week, so a service change shows up soon after the agency publishes it. If an agency’s schedule has run out, Atlas says so on the map.</p>
        <ArrowLink href={`${DOCS_PATH}#data-flow`}>{READ_HOW_ATLAS_WORKS}</ArrowLink>
      </TextSection>

      {/* Ryan, 2026-11-16 (CIV-1709): the page ends with the shared Request a demo card, the same as Planners. */}
      <div className="pb-16 sm:pb-20">
        <RequestDemoCard color={color(4)} />
      </div>

    </PageShell>
  );
}
