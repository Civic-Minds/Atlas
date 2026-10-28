import { CardDirectionRow } from './cardUi';
import type { routeLabels } from '../../utils/format';

export interface CardRouteListRow {
  key: string;
  /** The route's label parts from `routeLabels`: the row draws them as "**504** King" (CIV-928). */
  route: Pick<ReturnType<typeof routeLabels>, 'primary' | 'secondary'>;
  headway?: number;
  headwayLabel?: string;
  limited?: boolean;
  limitedLabel?: string;
  subLabel?: string;
  live?: boolean;
  /** A short note after the frequency (History: the change from the previous snapshot, "+10"), with its colour. */
  headwaySuffix?: string;
  headwaySuffixTone?: 'dim' | 'negative' | 'positive';
  /** A route the list cannot open (Night: a route with no id); the row is not clickable. */
  disabled?: boolean;
}

/**
 * The route rows of a list card: the agency card's routes, History's agency view and the Night list draw
 * them with this one component, so their spacing, hover, name and headway badge never drift apart.
 */
export default function CardRouteList({ rows, onSelect, dimmed = false }: {
  rows: readonly CardRouteListRow[];
  onSelect: (key: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="py-1">
      {rows.map(row => (
        <div key={row.key} className={`px-3 py-1 transition-colors ${row.disabled ? '' : 'hover:bg-[var(--bg-btn-hover)]'}`}>
          <CardDirectionRow
            label={row.route.secondary ? `${row.route.primary} ${row.route.secondary}` : row.route.primary}
            routeName={{ shortName: row.route.primary, name: row.route.secondary }}
            headway={row.headway}
            headwayLabel={row.headwayLabel}
            limited={row.limited}
            limitedLabel={row.limitedLabel}
            subLabel={row.subLabel}
            live={row.live}
            headwaySuffix={row.headwaySuffix}
            headwaySuffixTone={row.headwaySuffixTone}
            dimmed={dimmed}
            onClick={row.disabled ? undefined : () => onSelect(row.key)}
          />
        </div>
      ))}
    </div>
  );
}
