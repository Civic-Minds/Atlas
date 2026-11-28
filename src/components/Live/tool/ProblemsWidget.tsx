import Widget from './Widget';
import { CardDirectionRow } from '../../Interval/cardUi';
import { CARD_NOTICE } from '../../../styles';

export interface Problem { key: string; label: string; sub?: string; value: string; onPick: () => void }

/**
 * A short clickable list of the worst places (stops), each with its figure; a click selects it on the map. Each place is
 * the route card's own row (CardDirectionRow), with the card's spacing, so the list lines up with the section's title and
 * reads like the other sections (Ryan, 2026-11-27, on "Stops most often late": "This doesn't look great as-is").
 */
export default function ProblemsWidget({ title, rows, intro }: { title: string; rows: readonly Problem[]; /** A line under the title that says how the list is picked. */ intro?: string }) {
  if (!rows.length) return null;
  return (
    <Widget title={title} size="medium">
      {intro && <p className={`${CARD_NOTICE} m-0 mb-1`}>{intro}</p>}
      <div className="space-y-1">
        {rows.map(r => (
          <CardDirectionRow key={r.key} labelWeight="regular" label={r.sub ? `${r.label} ${r.sub}` : r.label} labelEnd={r.value} onClick={r.onPick} />
        ))}
      </div>
    </Widget>
  );
}
