import { Moon, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';
import PageShell from '../components/ui/PageShell';
import ArrowLink from '../components/ui/ArrowLink';
import { SURFACE } from '../styles';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';

const CARDS = [
  {
    href: FEATURE_ROUTES.nightService,
    Icon: Moon,
    title: 'Night service',
    body: 'Find routes with sustained service from 2am to 6am.',
  },
  {
    href: FEATURE_ROUTES.frequentService.story,
    Icon: Zap,
    title: 'Frequent service',
    body: 'See what frequent service means and which routes meet Atlas’s sustained-frequency thresholds.',
  },
];

export default function ResearchPage() {
  return (
    <PageShell>
        <div className="mt-10 lg:max-w-[42rem] lg:ml-[15rem]">
          <article className="space-y-8 text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">Research</PageTitle>
              <p className="mt-3">Views of transit service that the main map does not show.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {CARDS.map(({ href, Icon, title, body }) => (
                <a key={href} href={href} className={`${SURFACE} group block rounded-2xl p-5 transition-colors hover:border-[var(--accent-border)]`}>
                  <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                  <SectionTitle level="item" className="mt-4">{title}</SectionTitle>
                  <p className="mt-2">{body}</p>
                  <ArrowLink as="span" tone="inline" size="xs" nudge className="mt-4">Open</ArrowLink>
                </a>
              ))}
            </div>
          </article>
        </div>
    </PageShell>
  );
}
