import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

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
        <a
          className="inline-flex items-center gap-2 font-bold text-[var(--accent)] hover:underline"
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
        >
          {linkLabel} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </section>
  );
}
