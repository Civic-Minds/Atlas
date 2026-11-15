import Panel from '../ui/Panel';
import { PanelCloseButton } from '../ui/PanelHeader';
import { Z_PANEL } from '../../styles';
import {
  closeLabel, CONTEXT_INCOME_TOP, CONTEXT_LEGEND_TITLE_DENSITY, CONTEXT_LEGEND_TITLE_INCOME, CONTEXT_NO_DENSITY,
  CONTEXT_NO_INCOME, contextDensityLine, contextIncomeLine, contextMarginLine, contextUncertainLine,
} from '../../content/noticeCopy';
import { formatDensity, formatIncome, formatMarginPct, readContext, type ContextMetric, type ContextProps } from '../../utils/contextLayer';

/** The lines the popup shows for one tract: a title and one or two detail lines. Pure, so it can be tested. */
export function contextPopupLines(metric: ContextMetric, p: ContextProps): { title: string; lines: string[] } {
  const title = metric === 'density' ? CONTEXT_LEGEND_TITLE_DENSITY : CONTEXT_LEGEND_TITLE_INCOME;
  const r = readContext(metric, p);
  if (r.kind === 'missing') return { title, lines: [metric === 'density' ? CONTEXT_NO_DENSITY : CONTEXT_NO_INCOME] };
  if (metric === 'density') return { title, lines: [contextDensityLine(formatDensity(r.value))] };
  if (r.kind === 'uncertain') {
    return { title, lines: [r.marginPct === null ? CONTEXT_NO_INCOME : contextUncertainLine(formatMarginPct(r.marginPct))] };
  }
  if (r.topCoded) return { title, lines: [CONTEXT_INCOME_TOP] };
  return { title, lines: [contextIncomeLine(formatIncome(r.value)), ...(r.marginPct === null ? [] : [contextMarginLine(formatMarginPct(r.marginPct))])] };
}

/** Floating card next to the pointer, built on the same Panel as the right-click menu. */
export function ContextPopup({ metric, x, y, props, pinned, onClose }: { metric: ContextMetric; x: number; y: number; props: ContextProps; pinned: boolean; onClose: () => void }) {
  const { title, lines } = contextPopupLines(metric, props);
  return (
    <Panel
      role="status"
      className={`absolute ${Z_PANEL} ${pinned ? 'pointer-events-auto' : 'pointer-events-none'} max-w-[16rem] px-3 py-2`}
      style={{ left: Math.min(x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 270), top: Math.max(8, y + 12) }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold text-[var(--text-primary)]">{title}</p>
        {pinned && (
          <PanelCloseButton onClick={onClose} label={closeLabel(title)} className="shrink-0 -mr-1.5 -mt-1" />
        )}
      </div>
      {lines.map(line => <p key={line} className="mt-0.5 text-xs text-[var(--text-muted)]">{line}</p>)}
    </Panel>
  );
}
