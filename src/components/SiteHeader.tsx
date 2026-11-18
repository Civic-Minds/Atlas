import ArrowLink from './ui/ArrowLink';
import AppLink from './ui/AppLink';
import { FEATURE_ROUTES, FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';
import { ATLAS_BYLINE, DOCS_PAGE_TITLE, GO_TO_ATLAS_LABEL, INTERNAL_NAV_LABEL, SITE_NAV_LABEL } from '../content/noticeCopy';
import { ABOUT_PATH, DOCS_PATH } from '../../shared/pagePaths';
import { PAGE_NAMES } from '../../shared/pageNames';
import { INTERNAL_HEADER_LINKS } from '../../shared/internalPages';

/** Where the shared header's and footer's logo goes: the About home page (#1509). */
export const ABOUT_HOME_PATH = ABOUT_PATH;

/**
 * The shared page header. Its logo always opens the About home page and "Go to Atlas" opens the map (#1509; Ryan,
 * 2026-11-14: "like we already have the go to atlas button so confusing"), so the two never lead to the same place.
 * Agencies is in the footer only (CIV-1771, Ryan).
 */
export default function SiteHeader({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <header className="flex flex-col gap-y-3">
      {/* CIV-1872 : the local-only links, in the same text style, on their
          own row above the public ones; dev server only. */}
      {FEATURES.internal && (
        <nav aria-label={INTERNAL_NAV_LABEL} className="flex items-center justify-end gap-3 sm:gap-4 whitespace-nowrap text-sm font-bold text-[var(--text-muted)]">
          {INTERNAL_HEADER_LINKS.map(link => link.arrow
            ? <ArrowLink key={link.path} tone="quiet" href={link.path}>{link.label}</ArrowLink>
            : <AppLink key={link.path} to={link.path} className="hover:text-[var(--text-primary)]">{link.label}</AppLink>)}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {showWordmark ? (
          <AtlasLogo href={ABOUT_HOME_PATH} ariaLabel={ATLAS_BYLINE} showMark={false} size="page" hideByline />
        ) : <span aria-hidden="true" />}
        <nav aria-label={SITE_NAV_LABEL} className="flex items-center gap-3 sm:gap-4 whitespace-nowrap text-sm font-bold text-[var(--text-muted)]">
          {FEATURES.researchApps && <AppLink to={FEATURE_ROUTES.research} className="hover:text-[var(--text-primary)]">{PAGE_NAMES.research}</AppLink>}
          {/* CIV-1301: phones drop Docs (it is in the footer) so the other links fit on one line. */}
          <AppLink to={DOCS_PATH} className="hidden hover:text-[var(--text-primary)] sm:inline">{DOCS_PAGE_TITLE}</AppLink>
          <ArrowLink tone="quiet" href="/">{GO_TO_ATLAS_LABEL}</ArrowLink>
        </nav>
      </div>
    </header>
  );
}
