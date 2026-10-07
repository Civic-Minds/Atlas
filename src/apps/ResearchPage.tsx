import { Moon, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';
import { FLOATING_CARD } from '../styles';

export default function ResearchPage() {
  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-28 pb-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="max-w-2xl">
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">Research views for understanding transit service.</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[var(--text-muted)] sm:text-base">
            Research views use Atlas schedule data to examine service patterns that do not fit the everyday frequency map.
          </p>
        </div>
        <a href="/about" className="group mt-4 block rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 transition-colors hover:border-[var(--accent-border)]">
            <h2 className="text-lg font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">About Atlas</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Learn what Atlas does, where its data comes from, and what its measurements mean.</p>
        </a>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a href="/apps/night" className={`${FLOATING_CARD} group p-5 transition-colors hover:border-[var(--accent-border)]`}>
            <Moon className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="mt-5 text-lg font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">Night Service</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Find routes with sustained service from 2am to 6am.</p>
            <span className="mt-5 inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold text-[var(--text-primary)]">Open Night Service →</span>
          </a>

          <a href={FEATURE_ROUTES.frequentService.story} className={`${FLOATING_CARD} group p-5 transition-colors hover:border-[var(--accent-border)]`}>
            <Zap className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="mt-5 text-lg font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">Frequent Service</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Learn what frequent service means, then explore routes that meet Atlas’s sustained-frequency thresholds.</p>
            <span className="mt-5 inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold text-[var(--text-primary)]">Read the story →</span>
          </a>
        </div>
      </div>
    </div>
  );
}
