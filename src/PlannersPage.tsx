import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { PAGE_NAMES } from '../shared/pageNames';
import { FEATURES } from '../shared/config';
import { OPEN_LIVE_LABEL } from '../shared/liveWording';
import { LIVE_PATH } from '../shared/pagePaths';
import { PLANNERS_COPY } from './content/noticeCopy';
import FeatureCard, { featureCardAsset, featureCardColours } from './components/FeatureCard';
import RequestDemoCard from './components/RequestDemoCard';
import { DataSourceSection, PageHero } from './components/FeaturePageSections';

/**
 * "For Transit Planners" (CIV-1320). Local only (CIV-1704), so the beta cards 4-6 are too (CIV-1710: they stay local
 * only until their tools are built). Titles are title case (DECISIONS.md, 2026-11-15); the rest is sentence case. The
 * words are Ryan's, word for word (CIV-1793), in noticeCopy: seven cards in a planner's workflow order (CIV-1710), two
 * sentences each. Layout follows the About page: the wide column, the hero beside the map picture, and pale
 * frequency-colour tints for the feature cards.
 */

const { cards } = PLANNERS_COPY;
// CIV-1873 (Ryan, 2026-11-18): built features take the frequency tints in order down the page and Beta cards, not built
// yet, take one grey (featureCardColours), so a card's colour says what is real today. The picture side alternates.

export default function PlannersPage() {
  const tiers = useHeadwayTiers();
  const [cFrequency, cDayTime, cAgencies, cBeforeAfter, cVehicles, cDelays, cShare, cDemo] = featureCardColours(tiers, [
    false, false, false, !!cards.beforeAfter.beta, !!cards.vehiclesNeeded.beta, !!cards.delays.beta, false, false,
  ]);
  return (
    <PageShell variant="wide">

      <PageHero title={PAGE_NAMES.planners} intro={PLANNERS_COPY.intro} picture={featureCardAsset('hero')} />

      <div className="grid gap-5 py-16 sm:py-20">
        <FeatureCard title={cards.frequency.title} color={cFrequency} picture={featureCardAsset('card-frequency')}>
          <p>{cards.frequency.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.dayTime.title} color={cDayTime} picture={featureCardAsset('card-dayweek')} flip>
          <p>{cards.dayTime.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.agencies.title} color={cAgencies} picture={featureCardAsset('card-agency')}>
          <p>{cards.agencies.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.beforeAfter.title} color={cBeforeAfter} picture={null} flip beta={cards.beforeAfter.beta}>
          <p>{cards.beforeAfter.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.vehiclesNeeded.title} color={cVehicles} picture={null} beta={cards.vehiclesNeeded.beta}>
          <p>{cards.vehiclesNeeded.text}</p>
        </FeatureCard>
        {/* CIV-1705: the Live card became this one (CIV-1710 Q5), keeping its tint; it links to Live only when Live is on. */}
        <FeatureCard title={cards.delays.title} color={cDelays} picture={null} flip beta={cards.delays.beta}>
          <p>{cards.delays.text}</p>
          {FEATURES.live && <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink>}
        </FeatureCard>
        <FeatureCard title={cards.share.title} color={cShare} picture={featureCardAsset('card-export')}>
          <p>{cards.share.text}</p>
        </FeatureCard>
      </div>

      <DataSourceSection />

      {/* CIV-1706 (Ryan, 2026-11-15): the page ends with one ask, this button, with no line above it. It replaces the
          "Get in Touch" section. Ryan, 2026-11-16: it's a feature card, the shared Request a demo card. */}
      <div className="pb-16 sm:pb-20">
        <RequestDemoCard color={cDemo} text={PLANNERS_COPY.demo} flip />
      </div>

    </PageShell>
  );
}
