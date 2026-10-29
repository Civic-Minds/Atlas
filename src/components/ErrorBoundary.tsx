import { devHintsOn } from '../lib/devHints';
import React from 'react';
import { ANALYZE_DEV_HINT } from '../lib/liveReportData';
import { VIEW_ERROR_TEXT } from '../content/noticeCopy';

interface Props {
  children: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  /** Bumped on Retry so children remount instead of reusing broken state. */
  resetKey: number;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? 'view', error, info.componentStack);
    // Developers get the rebuild command here; the page text never carries it.
    if (devHintsOn() && this.props.label?.includes('older version')) console.info(`[Live] Rebuild the analysis with ${ANALYZE_DEV_HINT}`);
  }

  private handleRetry = () => {
    this.setState(s => ({ hasError: false, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm text-[var(--text-dim)]">
          <p>{this.props.label ?? VIEW_ERROR_TEXT}</p>
          <button
            type="button"
            className="px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-[var(--text-primary)]"
            onClick={this.handleRetry}
          >
            Retry
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
