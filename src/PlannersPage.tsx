import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { PAGE_NAMES } from '../shared/pageNames';
import { FEATURES } from '../shared/config';
import { OPEN_LIVE_LABEL } from '../shared/liveWording';
import { LIVE_PATH } from '../shared/pagePaths';
import { PLANNERS_COPY } from './content/noticeCopy';
import FeatureCard, { featureCardAsset } from './components/FeatureCard';
import RequestDemoCard from './components/RequestDemoCard';
import { DataSourceSection, PageHero } from './components/FeaturePageSections';

/**
 * "For Transit Planners" (CIV-1320). Local only (CIV-1704), so the beta cards 4-6 are too (CIV-1710: they stay local
 * only until their tools are built). Titles are title case (DECISIONS.md, 2026-11-15); the rest is sentence case. The
 * words are Ryan's, word for word (CIV-1793), in noticeCopy: seven cards in a planner's workflow order (CIV-1710), two
 * sentences each. Layout follows the About page: the wide column, the hero beside the map picture, and pale
 * frequency-colour tints for the feature cards, the picture side alternating card by card.
 */

const { cards } = PLANNERS_COPY;

export default function PlannersPage() {
  const tiers = useHeadwayTiers();
  const color = (i: number) => tiers[i % tiers.length].color;
  return (
    <PageShell variant="wide">

      <PageHero title={PAGE_NAMES.planners} intro={PLANNERS_COPY.intro} picture={featureCardAsset('hero')} />

      <div className="grid gap-5 py-16 sm:py-20">
        <FeatureCard title={cards.frequency.title} color={color(0)} picture={featureCardAsset('card-frequency')}>
          <p>{cards.frequency.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.dayTime.title} color={color(1)} picture={featureCardAsset('card-dayweek')} flip>
          <p>{cards.dayTime.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.agencies.title} color={color(2)} picture={featureCardAsset('card-agency')}>
          <p>{cards.agencies.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.beforeAfter.title} color={color(3)} picture={null} beta={cards.beforeAfter.beta}>
          <p>{cards.beforeAfter.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.vehiclesNeeded.title} color={color(4)} picture={null} beta={cards.vehiclesNeeded.beta}>
          <p>{cards.vehiclesNeeded.text}</p>
        </FeatureCard>
        {/* CIV-1705: the Live card became this one (CIV-1710 Q5); it links to Live only when Live is on. */}
        <FeatureCard title={cards.delays.title} color={color(5)} picture={null} beta={cards.delays.beta}>
          <p>{cards.delays.text}</p>
          {FEATURES.live && <ArrowLink href={LIVE_PATH}>{OPEN_LIVE_LABEL}</ArrowLink>}
        </FeatureCard>
        <FeatureCard title={cards.share.title} color={color(6)} picture={featureCardAsset('card-export')}>
          <p>{cards.share.text}</p>
        </FeatureCard>
      </div>

      <DataSourceSection />

      {/* CIV-1706 (Ryan, 2026-11-15): the page ends with one ask, this button, with no line above it. It replaces the
          "Get in Touch" section. Ryan, 2026-11-16: it's a feature card, the shared Request a demo card. */}
      <div className="pb-16 sm:pb-20">
        <RequestDemoCard color={color(7)} text={PLANNERS_COPY.demo} />
      </div>

    </PageShell>
  );
}
