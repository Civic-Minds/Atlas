import { ATLAS_MODE, FEATURE_ROUTES, FEATURES } from '../../shared/config';
import { BETA_SITE_URL } from '../../shared/seo';
import AtlasLogo from './AtlasLogo';
import { ATLAS_BYLINE } from '../content/noticeCopy';
import { PAGE_NAMES } from '../../shared/pageNames';
import { ABOUT_HOME_PATH } from './SiteHeader';
import { ABOUT_PATH, AGENCY_INDEX_PATH, CHANGELOG_PATH, DOCS_PATH, PLANNERS_PATH, PRIVACY_PATH, TERMS_PATH } from '../../shared/pagePaths';

type FooterLink = { href: string; label: string };

const LINK = 'text-[var(--accent)] hover:underline';

// Only pages that exist in this deployment are linked (these routes are feature-gated in main.tsx).
function footerGroups(): { title: string; links: FooterLink[] }[] {
  return [
    {
      title: 'Explore',
      links: [
        { href: '/', label: PAGE_NAMES.map },
        { href: AGENCY_INDEX_PATH, label: PAGE_NAMES.agencies },
      ],
    },
    {
      title: 'Learn',
      links: [
        { href: DOCS_PATH, label: PAGE_NAMES.docs },
        ...(FEATURES.researchApps ? [{ href: FEATURE_ROUTES.research, label: PAGE_NAMES.research }] : []),
        // CIV-1320: beta only for now (Ryan: "The beta can").
        ...(FEATURES.plannersLink ? [{ href: PLANNERS_PATH, label: PAGE_NAMES.plannersLink }] : []),
      ],
    },
    {
      // Ryan: the column is "Atlas" and its link "About" (link names are one word).
      title: 'Atlas',
      links: [
        { href: ABOUT_PATH, label: PAGE_NAMES.about },
        { href: CHANGELOG_PATH, label: PAGE_NAMES.whatsNew },
      ],
    },
  ];
}

/** The shared page footer; its logo opens the About home page, like the header's (#1509). */
export default function SiteFooter() {
  return (
    <footer className="mt-8 pt-5 sm:[html[data-consent-prompt]_&]:pb-16 text-sm text-[var(--text-dim)]" aria-label="Site footer">
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-x-20">
        <div className="col-span-3 sm:col-span-1">
          <AtlasLogo href={ABOUT_HOME_PATH} ariaLabel={ATLAS_BYLINE} showMark={false} size="page" />
          {/* Wraps below 1024px so the three link columns fit beside it from 640px up. */}
          <p className="mt-2 lg:whitespace-nowrap">Transit service, from schedule to street.</p>
        </div>
        <nav className="col-span-3 mb-2 grid grid-cols-subgrid gap-y-5" aria-label="Footer links">
          {footerGroups().map(group => (
            <div key={group.title}>
              <div className="mb-2 text-xs font-black text-[var(--text-muted)]">{group.title}</div>
              <ul className="space-y-1.5">
                {group.links.map(link => (
                  <li key={link.href}><a className={`whitespace-nowrap ${LINK}`} href={link.href}>{link.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <span className="order-1 col-span-3 -mt-4 sm:order-none sm:col-span-1 sm:mt-0">© {new Date().getFullYear()} Civic Minds.</span>
        <nav className="col-span-3 grid grid-cols-subgrid" aria-label="Legal links">
          {/* CIV-1630 (Ryan, option 1): "Beta · Terms · Privacy", on the public site only; beta doesn't link to itself. */}
          {ATLAS_MODE === 'public' && <a className={`col-start-1 justify-self-start whitespace-nowrap ${LINK}`} href={BETA_SITE_URL}>{PAGE_NAMES.betaLink}</a>}
          <a className={`col-start-2 justify-self-start whitespace-nowrap ${LINK}`} href={TERMS_PATH}>{PAGE_NAMES.termsLink}</a>
          <a className={`col-start-3 justify-self-start whitespace-nowrap ${LINK}`} href={PRIVACY_PATH}>{PAGE_NAMES.privacyLink}</a>
        </nav>
      </div>
    </footer>
  );
}
