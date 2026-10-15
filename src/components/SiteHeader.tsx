import ArrowLink from './ui/ArrowLink';
import { FEATURES } from '../../shared/config';
import AtlasBrand from './AtlasBrand';

export default function SiteHeader({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-6">
      {showWordmark ? (
        <a href="/" aria-label="Atlas by Civic Minds">
          <AtlasBrand size="page" hideByline />
        </a>
      ) : <span aria-hidden="true" />}
      <nav aria-label="Site navigation" className="flex items-center gap-3 sm:gap-4 whitespace-nowrap text-sm font-bold text-[var(--text-muted)]">
        {FEATURES.agencyPages && <a href="/agencies" className="hover:text-[var(--text-primary)]">Agencies</a>}
        {FEATURES.researchApps && <a href="/research" className="hover:text-[var(--text-primary)]">Research</a>}
        <a href="/about/docs" className="hover:text-[var(--text-primary)]">Docs</a>
        <ArrowLink tone="quiet" href="/">Go to Atlas</ArrowLink>
      </nav>
    </header>
  );
}
