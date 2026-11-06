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
        { href: '/terms', label: 'Terms' },
      ],
    },
    {
      title: 'About',
      links: [
        { href: '/about', label: 'About Atlas' },
        ...(FEATURES.whatsNew ? [{ href: '/changelog', label: 'Changelog' }] : []),
        { href: '/privacy', label: 'Privacy' },
      ],
    },
  ];
}

export default function SiteFooter({ logoHref = '/' }: { logoHref?: string }) {
  return (
    <footer className="mt-8 pt-5 sm:[html[data-consent-prompt]_&]:pb-16 text-sm text-[var(--text-dim)]" aria-label="Site footer">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <AtlasLogo href={logoHref} ariaLabel="Atlas by Civic Minds" showMark={false} size="page" />
          {/* Wraps below 1024px so the three link columns fit beside it from 640px up. */}
          <p className="mt-2 lg:whitespace-nowrap">Transit service, from schedule to street.</p>
        </div>
        <nav className="grid shrink-0 grid-cols-3 gap-x-4 gap-y-5 sm:flex sm:gap-x-20" aria-label="Footer links">
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
      <p className="mt-6">© {new Date().getFullYear()} Civic Minds.</p>
    </footer>
  );
}
