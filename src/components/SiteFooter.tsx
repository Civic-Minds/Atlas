import { ATLAS_MODE, FEATURE_ROUTES, FEATURES } from '../../shared/config';
import { BETA_SITE_URL } from '../../shared/seo';
import AtlasLogo from './AtlasLogo';
import { ATLAS_BYLINE, FOOTER_LINKS_LABEL, LEGAL_LINKS_LABEL, SITE_FOOTER_LABEL } from '../content/noticeCopy';
import { FOOTER_HEADINGS, PAGE_NAMES } from '../../shared/pageNames';
import { ABOUT_HOME_PATH } from './SiteHeader';
import { ABOUT_PATH, AGENCY_INDEX_PATH, CHANGELOG_PATH, DOCS_PATH, PLANNERS_PATH, PRIVACY_PATH, RESEARCHERS_PATH, TERMS_PATH } from '../../shared/pagePaths';

type FooterLink = { href: string; label: string };

const LINK = 'text-[var(--accent)] hover:underline';

// Sm-and-up grid templates by link-column count: the logo column, then one auto column per group (static strings for Tailwind).
const GRID_COLS: Record<number, string> = {
  3: 'sm:grid-cols-[1fr_auto_auto_auto] sm:gap-x-20',
  // CIV-1699: a fourth column (beta's Product) tightens the gaps below 1024px so all four fit beside the logo.
  4: 'sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-x-10 lg:gap-x-20',
};
const SPAN_COLS: Record<number, string> = { 3: 'sm:col-span-3', 4: 'sm:col-span-4' };
// The legal row (up to three links) sits under the last three link columns from 640px up.
const LEGAL_START: Record<number, readonly [string, string, string]> = {
  3: ['sm:col-start-1', 'sm:col-start-2', 'sm:col-start-3'],
  4: ['sm:col-start-2', 'sm:col-start-3', 'sm:col-start-4'],
};

// Only pages that exist in this deployment are linked (these routes are feature-gated in main.tsx); a column with no
// links isn't shown, so public, where For Planners is off, keeps three columns.
export function footerGroups(): { title: string; links: FooterLink[] }[] {
  const groups = [
    {
      title: FOOTER_HEADINGS.explore,
      links: [
        { href: '/', label: PAGE_NAMES.map },
        { href: AGENCY_INDEX_PATH, label: PAGE_NAMES.agencies },
      ],
    },
    {
      title: FOOTER_HEADINGS.learn,
      links: [
        { href: DOCS_PATH, label: PAGE_NAMES.docs },
        ...(FEATURES.researchApps ? [{ href: FEATURE_ROUTES.research, label: PAGE_NAMES.research }] : []),
      ],
    },
    {
      // CIV-1699: For Planners now, Studio later.
      title: FOOTER_HEADINGS.product,
      links: [
        // CIV-1320: beta only for now (Ryan: "The beta can").
        ...(FEATURES.plannersLink ? [{ href: PLANNERS_PATH, label: PAGE_NAMES.plannersLink }] : []),
        // CIV-1709: local only, like For Planners.
        ...(FEATURES.researchersLink ? [{ href: RESEARCHERS_PATH, label: PAGE_NAMES.researchers }] : []),
      ],
    },
    {
      title: FOOTER_HEADINGS.atlas,
      links: [
        { href: ABOUT_PATH, label: PAGE_NAMES.about },
        { href: CHANGELOG_PATH, label: PAGE_NAMES.whatsNew },
      ],
    },
  ];
  return groups.filter(group => group.links.length > 0);
}

/** The shared page footer; its logo opens the About home page, like the header's (#1509). */
export default function SiteFooter() {
  const groups = footerGroups();
  const columns = GRID_COLS[groups.length] ? groups.length : 3;
  const [legal1, legal2, legal3] = LEGAL_START[columns];
  return (
    <footer className="mt-8 pt-5 sm:[html[data-consent-prompt]_&]:pb-16 text-sm text-[var(--text-dim)]" aria-label={SITE_FOOTER_LABEL}>
      <div className={`grid grid-cols-3 gap-x-4 gap-y-6 ${GRID_COLS[columns]}`}>
        <div className="col-span-3 sm:col-span-1">
          <AtlasLogo href={ABOUT_HOME_PATH} ariaLabel={ATLAS_BYLINE} showMark={false} size="page" />
          {/* Wraps below 1024px so the link columns fit beside it from 640px up. */}
          <p className="mt-2 lg:whitespace-nowrap">Transit service, from schedule to street.</p>
        </div>
        <nav className={`col-span-3 ${SPAN_COLS[columns]} mb-2 grid grid-cols-subgrid gap-y-5`} aria-label={FOOTER_LINKS_LABEL}>
          {groups.map(group => (
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
        <nav className={`col-span-3 ${SPAN_COLS[columns]} grid grid-cols-subgrid`} aria-label={LEGAL_LINKS_LABEL}>
          {/* CIV-1630 (Ryan, option 1): "Beta · Terms · Privacy", on the public site only; beta doesn't link to itself. */}
          {ATLAS_MODE === 'public' && <a className={`col-start-1 ${legal1} justify-self-start whitespace-nowrap ${LINK}`} href={BETA_SITE_URL}>{PAGE_NAMES.betaLink}</a>}
          <a className={`col-start-2 ${legal2} justify-self-start whitespace-nowrap ${LINK}`} href={TERMS_PATH}>{PAGE_NAMES.termsLink}</a>
          <a className={`col-start-3 ${legal3} justify-self-start whitespace-nowrap ${LINK}`} href={PRIVACY_PATH}>{PAGE_NAMES.privacyLink}</a>
        </nav>
      </div>
    </footer>
  );
}
