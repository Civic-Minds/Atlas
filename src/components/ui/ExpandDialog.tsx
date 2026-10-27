import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { CARD_NOTE } from '../../styles';
import RoundIconButton from './RoundIconButton';

/**
 * The small icon that opens a chart's wide view, at the top right of the chart (the route card's hour chart, History's
 * route chart). Put it inside a `relative` box.
 */
export function ExpandButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-0 top-[-2px] z-20 p-[4px] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
    >
      {/* Exact px, not w-3/h-3: the root font is 14px, so rem sizes shrink to 10.5px. 12px tall
          like the label's text, centred on its 16px line (2px offset + 4px padding + 6px). */}
      <Maximize2 className="block w-[12px] h-[12px]" strokeWidth={2.5} />
    </button>
  );
}

/**
 * A chart's wide view over the page: a title, an optional grey note, a close button, then the chart. Escape, the close
 * button or a click outside closes it, and the page behind does not scroll while it is open. Render it only while open.
 */
export default function ExpandDialog({ title, note, ariaLabel, closeLabel, onClose, children }: {
  title: ReactNode;
  note?: ReactNode;
  ariaLabel: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-[1700] flex items-center justify-center bg-[var(--bg-app)]/60 p-4 backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[900px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-[var(--text-primary)]">{title}</h2>
            {note && <p className={`mt-1 ${CARD_NOTE}`}>{note}</p>}
          </div>
          <RoundIconButton onClick={onClose} aria-label={closeLabel}>
            <X className="w-4 h-4" />
          </RoundIconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
