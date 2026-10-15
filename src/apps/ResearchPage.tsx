import { Moon, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';
import PageShell from '../components/ui/PageShell';
import { SURFACE } from '../styles';

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
              <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Research</h1>
              <p className="mt-3">Views of transit service that the main map does not show.</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {CARDS.map(({ href, Icon, title, body }) => (
                <a key={href} href={href} className={`${SURFACE} group block rounded-2xl p-5 transition-colors hover:border-[var(--accent-border)]`}>
                  <Icon className="h-4 w-4 text-[var(--text-dim)]" aria-hidden="true" />
                  <h2 className="mt-4 text-base font-black text-[var(--text-primary)]">{title}</h2>
                  <p className="mt-2">{body}</p>
                  <span className="mt-4 inline-block text-xs font-bold text-[var(--text-muted)] group-hover:text-[var(--accent)]">Open →</span>
                </a>
              ))}
            </div>
          </article>
        </div>
    </PageShell>
  );
}
