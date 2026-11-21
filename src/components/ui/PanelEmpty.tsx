import type { ReactNode } from 'react';
import { PANEL_EMPTY, PANEL_EMPTY_TEXT } from '../../styles';
import Spinner from './Spinner';

interface PanelEmptyProps {
  /** empty: nothing to show. loading: a spinner and the wording from `loadingText`. error: wording from `loadErrorText`. */
  kind?: 'empty' | 'loading' | 'error';
  /** A button or link at the end of the line (Retry, Close). */
  action?: ReactNode;
  /** A second line under it that explains what to do (usually a CardHelpNotice). */
  detail?: ReactNode;
  /** Inside a card section that has its own padding: the same line without the panel row's padding (CIV-2003). */
  inline?: boolean;
  children: ReactNode;
}

/** The one "nothing here / loading / could not load" line inside a panel. Left aligned, muted, bold. */
export default function PanelEmpty({ kind = 'empty', action, detail, inline = false, children }: PanelEmptyProps) {
  const row = kind === 'loading' || action;
  const line = (
    <div className={`${inline ? PANEL_EMPTY_TEXT : PANEL_EMPTY}${row ? ' flex items-center gap-2' : ''}${action ? ' justify-between gap-3' : ''}`} role={kind === 'loading' ? 'status' : undefined}>
      {kind === 'loading' && <Spinner />}
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
  if (!detail) return line;
  return (
    <>
      {line}
      <div className="px-4 pb-3 -mt-2">{detail}</div>
    </>
  );
}
