import LegendItem from '../ui/LegendItem';
import {
  CONTEXT_LEGEND_TITLE_DENSITY, CONTEXT_LEGEND_TITLE_INCOME, CONTEXT_NO_DATA_LABEL,
} from '../../content/contextLayerCopy';
import { CONTEXT_COLOURS, CONTEXT_NO_DATA_COLOUR, contextClassLabels, type ContextMetric } from '../../utils/contextLayer';

/**
 * The key for the population / income shading: title, five classes and the hatched no-data row. It is a section of
 * the map's one legend (PersistentMapLegend) and is also shown under the Settings row, so it is never a card of its own.
 */
export function ContextKey({ metric }: { metric: ContextMetric }) {
  const labels = contextClassLabels(metric);
  return (
    <div data-context-key="" className="space-y-0.5">
      <p className="text-xs font-bold text-[var(--text-muted)]">{metric === 'density' ? CONTEXT_LEGEND_TITLE_DENSITY : CONTEXT_LEGEND_TITLE_INCOME}</p>
      <div className="space-y-0.5 pt-0.5">
        {CONTEXT_COLOURS[metric].map((colour, i) => (
          <div key={colour}><LegendItem kind="square" color={colour} className="text-xs text-[var(--text-primary)]">{labels[i]}</LegendItem></div>
        ))}
        <div>
          <LegendItem
            kind="square"
            color={`repeating-linear-gradient(135deg, ${CONTEXT_NO_DATA_COLOUR} 0 1px, transparent 1px 2.5px)`}
            className="text-xs text-[var(--text-primary)]"
          >{CONTEXT_NO_DATA_LABEL}</LegendItem>
        </div>
      </div>
    </div>
  );
}
