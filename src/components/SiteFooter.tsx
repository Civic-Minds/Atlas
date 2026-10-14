import { FEATURES } from '../../shared/config';
import AtlasBrand from './AtlasBrand';

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
  return (
    <footer className="mt-8 pt-5 text-sm text-[var(--text-dim)]" aria-label="Site footer">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <a href="/" aria-label="Atlas by Civic Minds">
            <AtlasBrand size="page" />
          </a>
          <p className="mt-2">Understanding transit service, from schedule to street.</p>
        </div>
        <nav className="grid grid-cols-3 gap-x-4 gap-y-5 sm:flex sm:gap-x-20" aria-label="Footer links">
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
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Civic Minds.</span>
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Legal links">
          <a className={LINK} href="/terms">Terms of Service</a>
          <span aria-hidden="true">·</span>
          <a className={LINK} href="/privacy">Privacy Policy</a>
        </nav>
      </div>
    </footer>
  );
}
