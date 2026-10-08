import { ArrowRight, Map } from 'lucide-react';

export default function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-6">
      <a href="/" aria-label="Atlas by Civic Minds" className="flex items-center gap-3 text-sm font-black">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--bg-app)]">
          <Map className="h-4 w-4" />
        </span>
        <span>Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span></span>
      </a>
      <nav aria-label="Site navigation" className="flex items-center gap-4 text-sm font-bold text-[var(--text-muted)]">
        <a href="/" className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">Go to Atlas <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
        <a href="/research" className="hover:text-[var(--text-primary)]">Research</a>
        <a href="/about/docs" className="hover:text-[var(--text-primary)]">Docs</a>
      </nav>
    </header>
  );
}
