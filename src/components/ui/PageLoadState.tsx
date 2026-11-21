import Pill from './Pill';
import { loadingText } from '../../content/noticeCopy';

/**
 * CIV-2003: a docs-style page's loading line and its "could not load" line with Retry, the one look the agency pages
 * (Studio's Coverage, the uneven-headway diagnostics) share while their agency list loads.
 */
export default function PageLoadState({ state, what, onRetry }: { state: 'loading' | 'error'; what: string; onRetry: () => void }) {
  return state === 'loading'
    ? <p className="mt-12 text-sm text-[var(--text-dim)]">{loadingText(what)}</p>
    : (
      <div className="mt-12 flex flex-col items-start gap-3 text-sm text-[var(--text-dim)]">
        <p>Could not load agency data.</p>
        <Pill tone="outline" size="segment" onClick={onRetry}>Retry</Pill>
      </div>
    );
}
