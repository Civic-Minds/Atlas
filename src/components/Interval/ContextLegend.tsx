import { FLOATING_CARD, Z_PANEL } from '../../styles';
import LegendItem from '../ui/LegendItem';
import {
  CONTEXT_LEGEND_TITLE_DENSITY, CONTEXT_LEGEND_TITLE_INCOME, CONTEXT_NO_DATA_LABEL, CONTEXT_NO_DATA_NOTE_DENSITY,
  CONTEXT_NO_DATA_NOTE_INCOME, CONTEXT_UNIT_DENSITY, CONTEXT_UNIT_INCOME, contextLegendSource,
} from '../../content/contextLayerCopy';
import { acsWindow, CONTEXT_COLOURS, CONTEXT_NO_DATA_COLOUR, contextClassLabels, type ContextMetric } from '../../utils/contextLayer';

/** Key for the population / income shading: title, unit, five classes, the no-data swatch, and the survey years. */
export function ContextLegend({ metric, year, raised = false }: { metric: ContextMetric; year: number | null; raised?: boolean }) {
  const labels = contextClassLabels(metric);
  const [first, last] = year ? acsWindow(year) : [null, null];
  return (
    <aside
      aria-label={metric === 'density' ? CONTEXT_LEGEND_TITLE_DENSITY : CONTEXT_LEGEND_TITLE_INCOME}
      data-context-legend=""
      className={`${FLOATING_CARD} absolute ${raised ? 'bottom-[13.5rem] max-sm:bottom-[22rem]' : 'bottom-16 max-sm:bottom-[9.5rem]'} left-5 ${Z_PANEL} w-60 max-w-[calc(100vw-2.5rem)] p-3 pointer-events-auto`}
    >
      <p className="text-xs font-bold text-[var(--text-primary)]">{metric === 'density' ? CONTEXT_LEGEND_TITLE_DENSITY : CONTEXT_LEGEND_TITLE_INCOME}</p>
      <p className="text-xs text-[var(--text-muted)]">{metric === 'density' ? CONTEXT_UNIT_DENSITY : CONTEXT_UNIT_INCOME}</p>
      <div className="mt-1.5 space-y-0.5">
        {CONTEXT_COLOURS[metric].map((colour, i) => (
          <div key={colour}><LegendItem color={colour} className="text-xs text-[var(--text-primary)]">{labels[i]}</LegendItem></div>
        ))}
        <div>
          <LegendItem
            color={`repeating-linear-gradient(135deg, ${CONTEXT_NO_DATA_COLOUR} 0 1px, transparent 1px 2.5px)`}
            className="text-xs text-[var(--text-primary)]"
          >{CONTEXT_NO_DATA_LABEL}</LegendItem>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-dim)]">{metric === 'density' ? CONTEXT_NO_DATA_NOTE_DENSITY : CONTEXT_NO_DATA_NOTE_INCOME}</p>
      {first && last && <p className="text-xs text-[var(--text-dim)]">{contextLegendSource(first, last)}</p>}
    </aside>
  );
}
