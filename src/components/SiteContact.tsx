import type { ReactNode } from 'react';
import { trackEvent } from '../lib/analytics';
import ArrowLink from './ui/ArrowLink';

const CONTACT_EMAIL = 'hey@ryanisnota.pro';

export default function SiteContact({
  id,
  title,
  children,
  subject,
  linkLabel,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  subject: string;
  linkLabel: string;
}) {
  return (
    <section id={id} className={id ? 'scroll-mt-8' : undefined}>
      <h2 className="text-base font-black text-[var(--text-primary)] mb-2">{title}</h2>
      <div className="space-y-2 text-[var(--text-dim)]">
        <p>{children}</p>
        <ArrowLink
          external
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
          onClick={() => trackEvent('feedback_opened', { source: 'site_contact' })}
        >
          {linkLabel}
        </ArrowLink>
      </div>
    </section>
  );
}
