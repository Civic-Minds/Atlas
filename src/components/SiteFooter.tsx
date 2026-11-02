import { FEATURES } from '../../shared/config';
import AtlasLogo from './AtlasLogo';

type FooterLink = { href: string; label: string };

const LINK = 'text-[var(--accent)] hover:underline';

// Only pages that exist in this deployment are linked (these routes are feature-gated in main.tsx).
function footerGroups(): { title: string; links: FooterLink[] }[] {
  return [
    {
      title: 'Explore',
      links: [
        { href: '/', label: 'Map' },
        ...(FEATURES.agencyPages ? [{ href: '/agencies', label: 'Agencies' }] : []),
      ],
    },
    {
      title: 'Learn',
      links: [
        { href: '/about/docs', label: 'Docs' },
        ...(FEATURES.researchApps ? [{ href: '/research', label: 'Research' }] : []),
      ],
    },
    {
      title: 'About',
      links: [
        { href: '/about', label: 'About Atlas' },
        ...(FEATURES.whatsNew ? [{ href: '/changelog', label: 'Changelog' }] : []),
      ],
    },
  ];
}

export default function SiteFooter() {
  // One grid for both rows, so Terms and Privacy line up under the link columns above them; the columns span the
  // nav rows through subgrid. Phones: the three columns under the tagline, then the year, then the legal links.
  return (
    <footer className="mt-8 pt-5 sm:[html[data-consent-prompt]_&]:pb-16 text-sm text-[var(--text-dim)]" aria-label="Site footer">
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-x-20">
        <div className="col-span-3 sm:col-span-1">
          <AtlasLogo href="/" ariaLabel="Atlas by Civic Minds" showMark={false} size="page" />
          <p className="mt-2 lg:whitespace-nowrap">Transit service, from schedule to street.</p>
        </div>
        <nav className="col-span-3 grid grid-cols-subgrid gap-y-5" aria-label="Footer links">
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
        <span className="col-span-3 sm:col-span-1">© {new Date().getFullYear()} Civic Minds.</span>
        <nav className="col-span-3 -mt-4 grid grid-cols-subgrid sm:mt-0" aria-label="Legal links">
          <a className={`justify-self-start whitespace-nowrap ${LINK}`} href="/terms">Terms</a>
          <a className={`justify-self-start whitespace-nowrap ${LINK}`} href="/privacy">Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
