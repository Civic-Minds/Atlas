import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import RoundIconButton from './RoundIconButton';

/** The header bar's frame: fixed 48px height, side padding and the rule under it. */
export const PANEL_HEADER_BAR = 'shrink-0 flex items-center justify-between px-5 border-b border-[var(--border-primary)] h-12';

/** The header's title text. */
export const PANEL_HEADER_TITLE = 'text-xs font-black text-[var(--text-primary)]';

/** The back arrow at the start of a dropdown panel's header. Give it an aria-label. */
export function PanelBackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-7 h-7 -ml-1.5 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] transition-colors shrink-0"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
    </button>
  );
}

/**
 * The close X of every panel, card and dialog (CIV-1569). `label` is `closeLabel(place)` from noticeCopy ("Close filters").
 * Each kind keeps the look it had:
 * - 'panel' (default): the round button in panel and card headers (About, Settings, What's new, the report form).
 * - 'dialog': the round button with the larger X of a chart's wide view (ExpandDialog).
 * - 'plain': the bare X with no round button, in the map export dialog.
 */
export function PanelCloseButton({ onClick, label, className, size = 'panel' }: { onClick: () => void; label: string; className?: string; size?: 'panel' | 'dialog' | 'plain' }) {
  if (size === 'plain') {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={`text-[var(--text-dim)] hover:text-[var(--text-primary)] ${className ?? ''}`.trim()}>
        <X className="h-4 w-4" />
      </button>
    );
  }
  return (
    <RoundIconButton onClick={onClick} aria-label={label} className={className}>
      <X className={size === 'dialog' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
    </RoundIconButton>
  );
}

/**
 * One header for the dropdown and floating panels (About, Settings and Filters, Privacy, What's new):
 * an optional back arrow, the title, and the close X. `titleId` names the panel for `aria-labelledby`.
 * A panel with its own title animation (About) builds from PANEL_HEADER_BAR, PanelBackButton and
 * PanelCloseButton instead.
 */
export default function PanelHeader({
  title, titleId, onBack, backLabel, onClose, closeLabel,
}: {
  title: ReactNode;
  titleId?: string;
  /** Shows the back arrow when given. */
  onBack?: () => void;
  backLabel?: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className={PANEL_HEADER_BAR}>
      <div className="flex items-center gap-1.5">
        {onBack && <PanelBackButton onClick={onBack} label={backLabel ?? 'Back'} />}
        <h2 id={titleId} className={PANEL_HEADER_TITLE}>{title}</h2>
      </div>
      <PanelCloseButton onClick={onClose} label={closeLabel} />
    </div>
  );
}
