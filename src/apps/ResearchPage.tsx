import { ArrowRight, Moon, Zap } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';
import { FLOATING_CARD } from '../styles';

export default function ResearchPage() {
  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-28 pb-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="max-w-2xl">
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl">Explore the patterns behind transit service.</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[var(--text-muted)] sm:text-base">
            Explore the service patterns that the everyday frequency map cannot show on its own.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a href="/apps/night" className={`${FLOATING_CARD} group relative overflow-hidden p-6 transition-all hover:-translate-y-1 hover:border-[var(--accent-border)]`}>
            <div className="absolute inset-x-0 top-0 h-1 bg-indigo-400" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300">
                <Moon className="h-5 w-5" />
              </div>
              <span className="text-right text-xs font-black uppercase tracking-[0.16em] text-[var(--text-dim)]">Overnight coverage</span>
            </div>
            <p className="mt-8 text-3xl font-black tracking-tight text-[var(--text-primary)]">2–6 AM</p>
            <h2 className="mt-2 text-lg font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">Night Service</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Find routes that keep running while most of the network is asleep.</p>
            <span className="mt-6 inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-black text-[var(--text-primary)]">See overnight routes <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
          </a>

          <a href={FEATURE_ROUTES.frequentService.story} className={`${FLOATING_CARD} group relative overflow-hidden p-6 transition-all hover:-translate-y-1 hover:border-[var(--accent-border)]`}>
            <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-300">
                <Zap className="h-5 w-5" />
              </div>
              <span className="text-right text-xs font-black uppercase tracking-[0.16em] text-[var(--text-dim)]">Frequency that matters</span>
            </div>
            <p className="mt-8 text-3xl font-black tracking-tight text-[var(--text-primary)]">15 / 30 min</p>
            <h2 className="mt-2 text-lg font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">Frequent Service</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-muted)]">Learn what frequent service means, then see which routes meet the threshold.</p>
            <span className="mt-6 inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-black text-[var(--text-primary)]">Read the service story <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
          </a>
        </div>
      </div>
    </div>
  );
}
