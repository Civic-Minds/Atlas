import { useEffect, useRef } from 'react';
import { FLOATING_CARD, MAP_LEGEND_SLOT, Z_MAP_OVERLAY } from '../../styles';
import { MAP_OVERLAY_VARS, publishMapOverlayVar } from '../../mapOverlayLayout';
import { useHeadwayTiers } from '../../hooks/useHeadwayTiers';
import MapKey from '../ui/MapKey';
import { MAP_KEY_FREQUENCY, MAP_KEY_OTHER, MAP_KEY_SELECTED, ON_DEMAND_PARTIAL_COVERAGE, MAP_LEGEND_LABEL } from '../../content/noticeCopy';
import { FEATURES } from '../../../shared/config';
import { ContextKey } from './ContextLegend';
import type { ContextMetric } from '../../utils/contextLayer';

/** The map's colour key. It reads the same palette as the map, so with colour-vision mode on it shows the friendly colours. */
export function PersistentMapLegend({ contextMetric = null }: { /** The population / income shading that is on, if any: its scale joins this card. */ contextMetric?: ContextMetric | null } = {}) {
  const tiers = useHeadwayTiers();
  // Its height plus a gap, so the notice pill sits above the key, not on it (CIV-1136).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => publishMapOverlayVar(MAP_OVERLAY_VARS.keyHeight, `${Math.round(el.getBoundingClientRect().height) + 8}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { observer.disconnect(); publishMapOverlayVar(MAP_OVERLAY_VARS.keyHeight, null); };
  }, []);
  return (
    <aside
      ref={ref}
      aria-label={MAP_LEGEND_LABEL}
      data-map-overlay="legend"
      className={`${FLOATING_CARD} ${MAP_LEGEND_SLOT} ${Z_MAP_OVERLAY} w-72 max-w-[calc(100vw-2.5rem)] p-3 pointer-events-auto`}
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
            {FEATURES.onDemand && (
              <p className="border-t border-[var(--border-primary)] mt-1.5 pt-1.5 text-xs leading-snug text-[var(--text-muted)]">{ON_DEMAND_PARTIAL_COVERAGE}</p>
            )}
            {contextMetric && <div className="border-t border-[var(--border-primary)] mt-1.5 pt-1.5"><ContextKey metric={contextMetric} /></div>}
          </div>
        )}
      />
    </aside>
  );
}
