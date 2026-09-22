import { HEADWAY_TIERS } from '../../../shared/config';
import { FLOATING_CARD } from '../../styles';

export function PersistentMapLegend() {
  return (
    <aside
      aria-label="Map legend"
      className={`${FLOATING_CARD} absolute bottom-16 left-5 z-[500] w-64 p-3 pointer-events-auto`}
    >
      <div className="space-y-1">
        <p className="text-[9px] font-bold text-[var(--text-muted)]">Frequency</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
          {HEADWAY_TIERS.map(tier => (
            <div key={tier.label} className="flex items-center gap-1.5 text-[9px] text-[var(--text-primary)]">
              <span aria-hidden="true" className="h-1.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: tier.color }} />
              <span>{tier.label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-primary)] pt-1.5 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-primary)]">
            <span aria-hidden="true" className="h-1.5 w-4 shrink-0 rounded-full bg-[var(--text-primary)]" />
            <span>Selected / qualifying</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
            <span aria-hidden="true" className="h-1 w-4 shrink-0 rounded-full bg-[var(--text-muted)] opacity-40" />
            <span>Other routes</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
