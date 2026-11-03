import ArrowLink from './ui/ArrowLink';
import { FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';

export default function SiteHeader({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      {showWordmark ? (
        <AtlasLogo href="/" ariaLabel="Atlas by Civic Minds" showMark={false} size="page" hideByline />
      ) : <span aria-hidden="true" />}
      <nav aria-label="Site navigation" className="flex items-center gap-3 sm:gap-4 whitespace-nowrap text-sm font-bold text-[var(--text-muted)]">
        {FEATURES.agencyPages && <a href="/agencies" className="hover:text-[var(--text-primary)]">Agencies</a>}
        {FEATURES.researchApps && <a href="/research" className="hover:text-[var(--text-primary)]">Research</a>}
        {/* CIV-1301: phones drop Docs (it is in the footer) so the other links fit on one line. */}
        <a href="/about/docs" className="hidden hover:text-[var(--text-primary)] sm:inline">Docs</a>
        <ArrowLink tone="quiet" href="/">Go to Atlas</ArrowLink>
      </nav>
    </header>
  );
}
