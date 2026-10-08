import { ArrowRight } from 'lucide-react';

export default function SiteHeader({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-6">
      {showWordmark ? (
        <a href="/" aria-label="Atlas by Civic Minds" className="text-sm font-black">
          Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span>
        </a>
      ) : <span aria-hidden="true" />}
      <nav aria-label="Site navigation" className="flex items-center gap-4 text-sm font-bold text-[var(--text-muted)]">
        <a href="/research" className="hover:text-[var(--text-primary)]">Research</a>
        <a href="/about/docs" className="hover:text-[var(--text-primary)]">Docs</a>
        <a href="/" className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">Go to Atlas <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
      </nav>
    </header>
  );
}
