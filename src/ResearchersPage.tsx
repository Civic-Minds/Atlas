import PageShell from './components/ui/PageShell';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import { PAGE_NAMES } from '../shared/pageNames';
import { ATLAS_INTRO_TEXT, RESEARCHERS_COPY } from './content/noticeCopy';
import FeatureCard, { featureCardAsset } from './components/FeatureCard';
import RequestDemoCard from './components/RequestDemoCard';
import { DataSourceSection, PageHero } from './components/FeaturePageSections';

/**
 * "For Researchers" (CIV-1709), built around History (Ryan, 2026-11-15: "things like history might be good for
 * researchers right", then 1). Local only, like the For Transit Planners page, until History goes public. It mirrors
 * PlannersPage: the same hero, its line the About intro in the bold lead style (the bold line above it is gone, CIV-1793 Q10), shared feature
 * cards with alternating picture sides, the same "Where the Data Comes From" section and the shared Request a demo card
 * at the end (Ryan, 2026-11-16). The card words are Ryan's, word for word (CIV-1793), in noticeCopy. Cards with no
 * picture yet pass null.
 */

const { cards } = RESEARCHERS_COPY;

export default function ResearchersPage() {
  const tiers = useHeadwayTiers();
  const color = (i: number) => tiers[i % tiers.length].color;
  return (
    <PageShell variant="wide">

      <PageHero title={PAGE_NAMES.researchers} intro={ATLAS_INTRO_TEXT} picture={featureCardAsset('hero')} boldIntro />

      <div className="grid gap-5 py-16 sm:py-20">
        {/* History is beta only (FEATURES.history); no picture yet. */}
        <FeatureCard title={cards.history.title} color={color(0)} picture={null} beta={cards.history.beta}>
          <p>{cards.history.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.compareCities.title} color={color(1)} picture={featureCardAsset('card-compare')} flip>
          <p>{cards.compareCities.text}</p>
        </FeatureCard>
        <FeatureCard title={cards.cite.title} color={color(2)} picture={featureCardAsset('card-cite')}>
          <p>{cards.cite.text}</p>
        </FeatureCard>
      </div>

      <DataSourceSection />

      {/* Ryan, 2026-11-16 (CIV-1709): the page ends with the shared Request a demo card, the same as Planners. */}
      <div className="pb-16 sm:pb-20">
        <RequestDemoCard color={color(4)} text={RESEARCHERS_COPY.demo} />
      </div>

    </PageShell>
  );
}
