import { CardDirectionRow } from './cardUi';

export interface CardRouteListRow {
  key: string;
  label: string;
  headway?: number;
  headwayLabel?: string;
  limited?: boolean;
  limitedLabel?: string;
  subLabel?: string;
  live?: boolean;
  /** A short note after the frequency (History: the change from the previous snapshot, "+10"), with its colour. */
  headwaySuffix?: string;
  headwaySuffixTone?: 'dim' | 'negative' | 'positive';
}

/**
 * The route rows of a list card: the agency card's routes and History's agency view draw them
 * with this one component, so their spacing, hover and headway badge never drift apart.
 */
export default function CardRouteList({ rows, onSelect, dimmed = false }: {
  rows: readonly CardRouteListRow[];
  onSelect: (key: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="py-1">
      {rows.map(row => (
        <div key={row.key} className="px-3 py-1 hover:bg-[var(--bg-btn-hover)] transition-colors">
          <CardDirectionRow
            label={row.label}
            headway={row.headway}
            headwayLabel={row.headwayLabel}
            limited={row.limited}
            limitedLabel={row.limitedLabel}
            subLabel={row.subLabel}
            live={row.live}
            headwaySuffix={row.headwaySuffix}
            headwaySuffixTone={row.headwaySuffixTone}
            dimmed={dimmed}
            onClick={() => onSelect(row.key)}
          />
        </div>
      ))}
    </div>
  );
}
