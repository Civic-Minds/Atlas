import ArrowLink from './ui/ArrowLink';
import { FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';
import { ATLAS_BYLINE } from '../content/noticeCopy';

/** Where the shared header's and footer's logo goes: the About home page (#1509). */
export const ABOUT_HOME_PATH = '/about';

/**
 * The shared page header. Its logo always opens the About home page and "Go to Atlas" opens the map (#1509; Ryan,
 * 2026-11-14: "like we already have the go to atlas button so confusing"), so the two never lead to the same place.
 */
export default function SiteHeader({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      {showWordmark ? (
        <AtlasLogo href={ABOUT_HOME_PATH} ariaLabel={ATLAS_BYLINE} showMark={false} size="page" hideByline />
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
