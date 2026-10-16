import type { ReactNode } from 'react';
import { PANEL_EMPTY } from '../../styles';
import Spinner from './Spinner';

interface PanelEmptyProps {
  /** empty: nothing to show. loading: a spinner and the wording from `loadingText`. error: wording from `loadErrorText`. */
  kind?: 'empty' | 'loading' | 'error';
  /** A button or link at the end of the line (Retry, Close). */
  action?: ReactNode;
  children: ReactNode;
}

/** The one "nothing here / loading / could not load" line inside a panel. Left aligned, muted, bold. */
export default function PanelEmpty({ kind = 'empty', action, children }: PanelEmptyProps) {
  const row = kind === 'loading' || action;
  return (
    <div className={`${PANEL_EMPTY}${row ? ' flex items-center gap-2' : ''}${action ? ' justify-between gap-3' : ''}`} role={kind === 'loading' ? 'status' : undefined}>
      {kind === 'loading' && <Spinner />}
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
}
