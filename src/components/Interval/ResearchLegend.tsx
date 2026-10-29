import { getNightServiceColor, getTierColor } from '../../utils/colors';
import { useColorMode } from '../../hooks/useColorMode';
import { headwayBandLabel, headwayTierLabel } from '../../utils/headwayText';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import MapKey from '../ui/MapKey';
import { MAP_KEY_NIGHT } from '../../content/noticeCopy';
import type { FrequentServiceFrequency } from '../../../shared/frequentService';

/**
 * The colour key for a research view, drawn as a stat-pill beside the route and agency pills
 * (the one placement rule for every view's legend). Night has one colour; Frequent Service has one
 * for 15 min and, in its 30 min view, a second for the 16 to 30 min routes.
 */
export default function ResearchLegend({ view, frequentFrequency }: { view: 'night' | 'frequent'; frequentFrequency: FrequentServiceFrequency }) {
  const mode = useColorMode();
  return (
    <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`} role="group" aria-label="Map colours">
      <MapKey steps={view === 'night'
        ? [{ color: getNightServiceColor(mode), label: <span className={MAP_BADGE_LABEL}>{MAP_KEY_NIGHT}</span> }]
        : [
          { color: getTierColor('15', mode), label: <span className={MAP_BADGE_LABEL}>{headwayTierLabel(15)}</span> },
          ...(frequentFrequency === 30 ? [{ color: getTierColor('30', mode), label: <span className={MAP_BADGE_LABEL}>{headwayBandLabel(16, 30)}</span> }] : []),
        ]} />
    </div>
  );
}
