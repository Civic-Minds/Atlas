import React from 'react';

interface Props {
  children: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm text-[var(--text-dim)]">
          <p>{this.props.label ?? 'Something went wrong loading this view.'}</p>
          <button
            type="button"
            className="px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-[var(--text-primary)]"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
