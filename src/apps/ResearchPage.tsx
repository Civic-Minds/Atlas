import { Moon, Ticket, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';
import DocsPageLayout from '../components/ui/DocsPageLayout';
import ArrowLink from '../components/ui/ArrowLink';
import Tag from '../components/ui/Tag';
import { SURFACE } from '../styles';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';
import { freeChildFareStats } from '../data/freeChildFares';

/** Each card names its kind of page with a small label (CIV-1167, Ryan's "Sure"). */
const CARDS = [
  {
    href: FEATURE_ROUTES.nightService,
    Icon: Moon,
    kind: 'Map',
    title: 'Overnight service',
    body: 'Find routes with sustained service from 2–5 AM.',
  },
  {
    href: FEATURE_ROUTES.frequentService.story,
    Icon: Zap,
    kind: 'Story',
    title: 'Frequent service',
    body: 'See what frequent service means and which routes meet Atlas’s sustained-frequency thresholds.',
  },
  {
    href: FEATURE_ROUTES.freeChildFares,
    Icon: Ticket,
    kind: 'Data',
    title: 'Free child fares',
    body: `See up to what age children ride free at ${freeChildFareStats.agencies} transit agencies.`,
  },
];

export default function ResearchPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">Research</PageTitle>
              <p className="mt-3">Views of transit service that the main map does not show.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {CARDS.map(({ href, Icon, kind, title, body }) => (
                <a key={href} href={href} className={`${SURFACE} group block rounded-2xl p-5 transition-colors hover:border-[var(--accent-border)]`}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                    <Tag>{kind}</Tag>
                  </div>
                  <SectionTitle level="item" className="mt-4">{title}</SectionTitle>
                  <p className="mt-2">{body}</p>
                  <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-4">Open</ArrowLink>
                </a>
              ))}
            </div>
    </DocsPageLayout>
  );
}
