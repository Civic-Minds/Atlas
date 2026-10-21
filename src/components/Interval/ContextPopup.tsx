import { X } from 'lucide-react';
import Panel from '../ui/Panel';
import { Z_PANEL } from '../../styles';
import {
  CONTEXT_INCOME_TOP, CONTEXT_POPUP_CLOSE, CONTEXT_POPUP_DENSITY, CONTEXT_POPUP_INCOME, CONTEXT_POPUP_MARGIN,
  CONTEXT_POPUP_NO_DENSITY, CONTEXT_POPUP_NO_INCOME, CONTEXT_POPUP_UNRELIABLE,
  CONTEXT_LEGEND_TITLE_DENSITY, CONTEXT_LEGEND_TITLE_INCOME,
} from '../../content/contextLayerCopy';
import { formatDensity, formatIncome, formatMarginPct, readContext, type ContextMetric, type ContextProps } from '../../utils/contextLayer';

/** The lines the popup shows for one tract: a title and one or two detail lines. Pure, so it can be tested. */
export function contextPopupLines(metric: ContextMetric, p: ContextProps): { title: string; lines: string[] } {
  const title = metric === 'density' ? CONTEXT_LEGEND_TITLE_DENSITY : CONTEXT_LEGEND_TITLE_INCOME;
  const r = readContext(metric, p);
  if (r.kind === 'missing') return { title, lines: [metric === 'density' ? CONTEXT_POPUP_NO_DENSITY : CONTEXT_POPUP_NO_INCOME] };
  if (metric === 'density') return { title, lines: [CONTEXT_POPUP_DENSITY(formatDensity(r.value))] };
  if (r.kind === 'uncertain') {
    return { title, lines: [r.marginPct === null ? CONTEXT_POPUP_NO_INCOME : CONTEXT_POPUP_UNRELIABLE(formatMarginPct(r.marginPct))] };
  }
  if (r.topCoded) return { title, lines: [CONTEXT_INCOME_TOP] };
  return { title, lines: [CONTEXT_POPUP_INCOME(formatIncome(r.value)), ...(r.marginPct === null ? [] : [CONTEXT_POPUP_MARGIN(formatMarginPct(r.marginPct))])] };
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
          <button type="button" onClick={onClose} aria-label={CONTEXT_POPUP_CLOSE} className="shrink-0 text-[var(--text-dim)] hover:text-[var(--text-primary)]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {lines.map(line => <p key={line} className="mt-0.5 text-xs text-[var(--text-muted)]">{line}</p>)}
    </Panel>
  );
}
