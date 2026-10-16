import { FLOATING_CARD } from '../../styles';
import { useHeadwayTiers } from '../../hooks/useHeadwayTiers';
import LegendItem from '../ui/LegendItem';

/** The map's colour key. It reads the same palette as the map, so with colour-vision mode on it shows the friendly colours. */
export function PersistentMapLegend() {
  const tiers = useHeadwayTiers();
  return (
    <aside
      aria-label="Map legend"
      className={`${FLOATING_CARD} absolute bottom-16 left-5 z-[500] w-72 max-w-[calc(100vw-2.5rem)] p-3 pointer-events-auto`}
    >
      <div className="space-y-1">
        <p className="text-xs font-bold text-[var(--text-muted)]">Frequency</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
          {tiers.map(tier => (
            <LegendItem key={tier.label} kind="line" color={tier.color} className="text-xs text-[var(--text-primary)]">{tier.label}</LegendItem>
          ))}
        </div>
        <div className="border-t border-[var(--border-primary)] pt-1.5 space-y-0.5">
          <LegendItem kind="line" color="var(--text-primary)" className="flex text-xs text-[var(--text-primary)]">Selected / qualifying</LegendItem>
          <LegendItem kind="line" color="var(--text-muted)" className="flex text-xs text-[var(--text-muted)] opacity-60">Other routes</LegendItem>
        </div>
      </div>
    </aside>
  );
}
