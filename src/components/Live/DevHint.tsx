/** A developer-only line (a rebuild command). Renders nothing outside dev builds, so readers never see it. */
export default function DevHint({ hint, className = 'mt-1' }: { hint?: string | null; className?: string }) {
  if (!import.meta.env.DEV || !hint) return null;
  return <p className={`${className} text-xs text-[var(--text-dim)]`}>Dev: <code>{hint}</code></p>;
}
