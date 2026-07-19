import React from 'react';

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
  }

  private handleRetry = () => {
    this.setState(s => ({ hasError: false, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm text-[var(--text-dim)]">
          <p>{this.props.label ?? 'Something went wrong loading this view.'}</p>
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
