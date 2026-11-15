import { FEATURE_ROUTES, FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';
import { ABOUT_ATLAS, ATLAS_BYLINE, DOCS_LINK_LABEL } from '../content/noticeCopy';
import { ABOUT_HOME_PATH } from './SiteHeader';
import { ABOUT_PATH, AGENCY_INDEX_PATH, CHANGELOG_PATH, DOCS_PATH, PRIVACY_PATH, TERMS_PATH } from '../../shared/pagePaths';

type FooterLink = { href: string; label: string };

const LINK = 'text-[var(--accent)] hover:underline';

// Only pages that exist in this deployment are linked (these routes are feature-gated in main.tsx).
function footerGroups(): { title: string; links: FooterLink[] }[] {
  return [
    {
      title: 'Explore',
      links: [
        { href: '/', label: 'Map' },
        ...(FEATURES.agencyPages ? [{ href: AGENCY_INDEX_PATH, label: 'Agencies' }] : []),
      ],
    },
    {
      title: 'Learn',
      links: [
        { href: DOCS_PATH, label: DOCS_LINK_LABEL },
        ...(FEATURES.researchApps ? [{ href: FEATURE_ROUTES.research, label: 'Research' }] : []),
      ],
    },
    {
      title: 'About',
      links: [
        { href: ABOUT_PATH, label: ABOUT_ATLAS },
        ...(FEATURES.whatsNew ? [{ href: CHANGELOG_PATH, label: 'Changelog' }] : []),
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
          <a className={`col-start-2 justify-self-start whitespace-nowrap ${LINK}`} href={TERMS_PATH}>Terms</a>
          <a className={`col-start-3 justify-self-start whitespace-nowrap ${LINK}`} href={PRIVACY_PATH}>Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
