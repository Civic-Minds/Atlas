import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
        // Error captured in state via getDerivedStateFromError
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
                    <div className="max-w-md w-full bg-[var(--item-bg)] border border-[var(--border)] rounded-2xl shadow-lg p-8 text-center space-y-4">
                        <div className="inline-flex p-3 rounded-xl bg-red-500/10 text-red-500">
                            <AlertTriangle className="w-8 h-8" />
                        </div>
                        <h1 className="text-xl font-black text-[var(--fg)]">Something went wrong</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            The application encountered an unexpected error.
                        </p>
                        {this.state.error?.message && (
                            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                                <code className="text-red-500 text-xs break-all">
                                    {this.state.error.message}
                                </code>
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
