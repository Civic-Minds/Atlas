import { getNightServiceColor, getTierColor } from '../../utils/colors';
import { useColorVision } from '../../context/ColorVisionContext';
import { headwayBandLabel, headwayTierLabel } from '../../utils/headwayText';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import LegendItem from '../ui/LegendItem';
import type { FrequentServiceFrequency } from '../../../shared/frequentService';

/**
 * The colour key for a research view, drawn as a stat-pill beside the route and agency pills
 * (the one placement rule for every view's legend). Night has one colour; Frequent Service has one
 * for 15 min and, in its 30 min view, a second for the 16 to 30 min routes.
 */
export default function ResearchLegend({ view, frequentFrequency }: { view: 'night' | 'frequent'; frequentFrequency: FrequentServiceFrequency }) {
  const { colorVisionFriendly } = useColorVision();
  const mode = colorVisionFriendly ? 'friendly' : 'default';
  return (
    <div className={`${MAP_BADGE} h-8`} role="group" aria-label="Map colours">
      {view === 'night' ? (
        <LegendItem kind="line" color={getNightServiceColor(mode)}><span className={MAP_BADGE_LABEL}>Night service</span></LegendItem>
      ) : (
        <>
          <LegendItem kind="line" color={getTierColor('15', mode)}><span className={MAP_BADGE_LABEL}>{headwayTierLabel(15)}</span></LegendItem>
          {frequentFrequency === 30 && (
            <LegendItem kind="line" color={getTierColor('30', mode)}><span className={MAP_BADGE_LABEL}>{headwayBandLabel(16, 30)}</span></LegendItem>
          )}
        </>
      )}
    </div>
  );
}
