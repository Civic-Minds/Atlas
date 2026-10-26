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

/** The close X at the end of a dropdown panel's header. */
export function PanelCloseButton({ onClick, label, className }: { onClick: () => void; label: string; className?: string }) {
  return (
    <RoundIconButton onClick={onClick} aria-label={label} className={className}>
      <X className="w-3.5 h-3.5" />
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
      <div className="flex items-center gap-1.5 min-w-0">
        {onBack && <PanelBackButton onClick={onBack} label={backLabel ?? 'Back'} />}
        <h2 id={titleId} className={PANEL_HEADER_TITLE}>{title}</h2>
      </div>
      <PanelCloseButton onClick={onClose} label={closeLabel} />
    </div>
  );
}
