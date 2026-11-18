import { MapLegendCard } from '../ui/MapLegendCard';
import { useHeadwayTiers } from '../../hooks/useHeadwayTiers';
import MapKey from '../ui/MapKey';
import { MAP_KEY_FREQUENCY, MAP_KEY_OTHER, MAP_KEY_SELECTED, ON_DEMAND_PARTIAL_COVERAGE, MAP_LEGEND_LABEL } from '../../content/noticeCopy';
import { FEATURES } from '../../../shared/config';
import { ContextKey } from './ContextLegend';
import type { ContextMetric } from '../../utils/contextLayer';

/** The map's colour key. It reads the same palette as the map, so with colour-vision mode on it shows the friendly colours. */
export function PersistentMapLegend({ contextMetric = null }: { /** The population / income shading that is on, if any: its scale joins this card. */ contextMetric?: ContextMetric | null } = {}) {
  const tiers = useHeadwayTiers();
  return (
    <MapLegendCard label={MAP_LEGEND_LABEL}>
      <MapKey
        definition={MAP_KEY_FREQUENCY}
        stepsClassName="grid grid-cols-3 gap-x-2 gap-y-0.5"
        steps={tiers.map(tier => ({ color: tier.color, label: tier.label, className: 'text-xs text-[var(--text-primary)]' }))}
        after={(
          <div className="border-t border-[var(--border-primary)] pt-1.5 space-y-0.5">
            <MapKey steps={[
              { color: 'var(--text-primary)', label: MAP_KEY_SELECTED, className: 'flex text-xs text-[var(--text-primary)]' },
              { color: 'var(--text-muted)', label: MAP_KEY_OTHER, className: 'flex text-xs text-[var(--text-muted)]', swatchClassName: 'opacity-40' },
            ]} />
            {FEATURES.onDemand && (
              <p className="border-t border-[var(--border-primary)] mt-1.5 pt-1.5 text-xs leading-snug text-[var(--text-muted)]">{ON_DEMAND_PARTIAL_COVERAGE}</p>
            )}
            {contextMetric && <div className="border-t border-[var(--border-primary)] mt-1.5 pt-1.5"><ContextKey metric={contextMetric} /></div>}
          </div>
        )}
      />
    </MapLegendCard>
  );
}
