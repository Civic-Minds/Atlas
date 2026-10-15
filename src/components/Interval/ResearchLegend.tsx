import { getNightServiceColor, getTierColor } from '../../utils/colors';
import { useColorVision } from '../../context/ColorVisionContext';
import { headwayBandLabel, headwayTierLabel } from '../../utils/headwayText';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import type { FrequentServiceFrequency } from '../../../shared/frequentService';

/**
 * The colour key for a research view, drawn as a stat-pill beside the route and agency pills
 * (the one placement rule for every view's legend). Night has one colour; Frequent Service has one
 * for 15 min and, in its 30 min view, a second for the 16 to 30 min routes.
 */
export default function ResearchLegend({ view, frequentFrequency }: { view: 'night' | 'frequent'; frequentFrequency: FrequentServiceFrequency }) {
  const { colorVisionFriendly } = useColorVision();
  const mode = colorVisionFriendly ? 'friendly' : 'default';
  const swatch = (color: string, thick: boolean) => (
    <span aria-hidden="true" className={`inline-block rounded-full ${thick ? 'h-1' : 'h-0.5'}`} style={{ background: color, width: 12 }} />
  );
  return (
    <div className={`${MAP_BADGE} h-8`} role="group" aria-label="Map colours">
      {view === 'night' ? (
        <span className="flex items-center gap-1.5">{swatch(getNightServiceColor(mode), true)}<span className={MAP_BADGE_LABEL}>Night service</span></span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">{swatch(getTierColor('15', mode), true)}<span className={MAP_BADGE_LABEL}>{headwayTierLabel(15)}</span></span>
          {frequentFrequency === 30 && (
            <span className="flex items-center gap-1.5">{swatch(getTierColor('30', mode), false)}<span className={MAP_BADGE_LABEL}>{headwayBandLabel(16, 30)}</span></span>
          )}
        </>
      )}
    </div>
  );
}
