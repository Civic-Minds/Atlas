import { devHintsOn } from '../../lib/devHints';

/** A developer-only line (a rebuild command). Renders nothing unless developer hints are switched on (?dev=1 or localStorage 'atlas.devHints' = '1'), so reviewers and readers never see it. */
export default function DevHint({ hint, className = 'mt-1' }: { hint?: string | null; className?: string }) {
  if (!hint || !devHintsOn()) return null;
  return <p className={`${className} text-xs text-[var(--text-dim)]`}>Dev: <code>{hint}</code></p>;
}
