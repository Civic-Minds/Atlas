import { FEATURES } from '../shared/config';
import PageShell from './components/ui/PageShell';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import { newestResearch } from './data/research';

/** "Explore our research" (Ryan) shows the newest research, so a new page appears here without editing this one (CIV-1205). */
const KEEP_LOOKING_COUNT = 3;

export default function AboutPage() {
  return (
    <PageShell variant="wide">

        <section className="border-b border-[var(--border-primary)] pb-20 pt-24 sm:pt-32">
          <div>
            <PageTitle level="hero">Find the transit service that actually runs.</PageTitle>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency, and place.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ArrowLink href="/">Try Atlas</ArrowLink>
              {FEATURES.researchApps && <a href="/research" className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">Explore research</a>}
            </div>
          </div>

        </section>

        <section className="border-b border-[var(--border-primary)] py-16 sm:py-20" aria-label="What Atlas shows">
          <h2 id="questions-heading" className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Understand the network beyond the route map.</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <div className="border-t-2 border-[var(--accent-border)] pt-4">
              <h3 className="text-base font-black">Where</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">See the routes and places connected by a network.</p>
            </div>
            <div className="border-t-2 border-[var(--accent-border)] pt-4">
              <h3 className="text-base font-black">When</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">See what still runs in the morning, evening, or overnight.</p>
            </div>
            <div className="border-t-2 border-[var(--accent-border)] pt-4">
              <h3 className="text-base font-black">How often</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Compare scheduled frequency without opening a schedule.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <h2 className="max-w-xs text-2xl font-black tracking-tight">Built for looking closer.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>Atlas brings published agency schedules into one place so riders, planners, researchers, and advocates can compare routes across cities, time periods, and modes.</p>
            <p>It does not replace official trip planning or live alerts. It makes the patterns in scheduled service easier to see.</p>
            <ArrowLink href="/about/docs">Read how Atlas works</ArrowLink>
          </div>
        </section>

        {FEATURES.researchApps && <section className="border-t border-[var(--border-primary)] py-12" aria-labelledby="research-heading">
          <h2 id="research-heading" className="text-2xl font-black tracking-tight">Explore our research</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {newestResearch(KEEP_LOOKING_COUNT).map(({ href, title, body, linkText }) => (
              <a key={href} href={href} className="group flex flex-col border-l-2 border-[var(--accent-border)] pl-4">
                <h3 className="text-lg font-black group-hover:text-[var(--accent)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
                {/* Pinned to the bottom so the links line up across the row, as on /research. */}
                <ArrowLink as="span" nudge className="mt-auto self-start pt-4">{linkText}</ArrowLink>
              </a>
            ))}
          </div>
        </section>}
    </PageShell>
  );
}
