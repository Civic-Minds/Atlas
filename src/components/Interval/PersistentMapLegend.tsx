import { FLOATING_CARD } from '../../styles';
import { useHeadwayTiers } from '../../hooks/useHeadwayTiers';
import MapKey from '../ui/MapKey';
import { MAP_KEY_FREQUENCY, MAP_KEY_OTHER, MAP_KEY_SELECTED } from '../../content/noticeCopy';

/** The map's colour key. It reads the same palette as the map, so with colour-vision mode on it shows the friendly colours. */
export function PersistentMapLegend() {
  const tiers = useHeadwayTiers();
  return (
    <aside
      aria-label="Map legend"
      className={`${FLOATING_CARD} absolute bottom-16 left-5 z-[500] w-72 max-w-[calc(100vw-2.5rem)] p-3 pointer-events-auto`}
    >
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
          </div>
        )}
      />
    </aside>
  );
}
