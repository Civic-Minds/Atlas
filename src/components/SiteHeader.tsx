import ArrowLink from './ui/ArrowLink';
import { FEATURE_ROUTES, FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';
import { ATLAS_BYLINE, DOCS_PAGE_TITLE } from '../content/noticeCopy';
import { ABOUT_PATH, AGENCY_INDEX_PATH, DOCS_PATH } from '../../shared/pagePaths';
import { PAGE_NAMES } from '../../shared/pageNames';

/** Where the shared header's and footer's logo goes: the About home page (#1509). */
export const ABOUT_HOME_PATH = ABOUT_PATH;

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
        {FEATURES.agencyPages && <a href={AGENCY_INDEX_PATH} className="hover:text-[var(--text-primary)]">{PAGE_NAMES.agencies}</a>}
        {FEATURES.researchApps && <a href={FEATURE_ROUTES.research} className="hover:text-[var(--text-primary)]">{PAGE_NAMES.research}</a>}
        {/* CIV-1301: phones drop Docs (it is in the footer) so the other links fit on one line. */}
        <a href={DOCS_PATH} className="hidden hover:text-[var(--text-primary)] sm:inline">{DOCS_PAGE_TITLE}</a>
        <ArrowLink tone="quiet" href="/">Go to Atlas</ArrowLink>
      </nav>
    </header>
  );
}
