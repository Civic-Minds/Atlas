import { ArrowRight } from 'lucide-react';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';

const lenses = [
  { number: '01', label: 'Frequency', text: 'How often service comes.' },
  { number: '02', label: 'Service span', text: 'When useful service starts and ends.' },
  { number: '03', label: 'Coverage', text: 'Where the network actually reaches.' },
  { number: '04', label: 'Modes', text: 'How bus, rail, ferry, and other services differ.' },
  { number: '05', label: 'History', text: 'How scheduled service changes over time.' },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <SiteHeader />

        <section className="grid gap-12 border-b border-[var(--border-primary)] pb-20 pt-24 sm:pt-32 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">About Atlas</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">Find the transit service that actually runs.</h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">Atlas turns published agency schedules into a map you can explore by frequency, time of day, agency, and place.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-black text-[var(--bg-app)] hover:opacity-80">Open the map <ArrowRight className="h-4 w-4" /></a>
              <a href="/research" className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">Explore research</a>
            </div>
          </div>

          <div className="self-end border-l-2 border-[var(--accent-border)] pl-6 lg:mb-2">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--text-dim)]">A different kind of map</p>
            <p className="mt-4 text-xl font-black leading-8">Not just where a route goes, but when it is useful.</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">Atlas is for looking at the service behind the line: the intervals, the gaps, the hours, and the places connected.</p>
          </div>
        </section>

        <section className="grid gap-10 border-b border-[var(--border-primary)] py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20" aria-labelledby="lenses-heading">
          <h2 id="lenses-heading" className="max-w-xs text-2xl font-black tracking-tight">Look at a network from more than one angle.</h2>
          <div>
            <p className="max-w-xl text-base leading-7 text-[var(--text-muted)]">Together, these views show how a network works: where service goes, when it runs, how often it comes, and how it changes.</p>
            <div className="mt-8 divide-y divide-[var(--border-primary)] border-y border-[var(--border-primary)]">
              {lenses.map(({ number, label, text }) => (
                <div key={label} className="grid grid-cols-[2.5rem_1fr] gap-4 py-4 sm:grid-cols-[3rem_10rem_1fr] sm:items-center">
                  <span className="text-xs font-black tabular-nums text-[var(--accent)]">{number}</span>
                  <h3 className="text-base font-black">{label}</h3>
                  <p className="col-start-2 text-sm leading-6 text-[var(--text-muted)] sm:col-start-3">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <h2 className="max-w-xs text-2xl font-black tracking-tight">Built for looking closer.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>Atlas brings published agency schedules into one place so riders, planners, researchers, and advocates can compare routes across cities, time periods, and modes.</p>
            <p>It does not replace official trip planning or live alerts. It makes the patterns in scheduled service easier to see.</p>
            <a href="/about/docs" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">Read how Atlas works <ArrowRight className="h-4 w-4" /></a>
          </div>
        </section>

        <section className="border-t border-[var(--border-primary)] py-12" aria-labelledby="research-heading">
          <h2 id="research-heading" className="text-2xl font-black tracking-tight">Keep looking.</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <a href="/research/frequent-service/story" className="group border-l-2 border-[var(--accent-border)] pl-4">
              <h3 className="text-lg font-black group-hover:text-[var(--accent)]">What happens when you miss the bus?</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">A source-backed look at what frequent service means across transit networks.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]">Read the story <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </a>
            <a href="/apps/night" className="group border-l-2 border-[var(--accent-border)] pl-4">
              <h3 className="text-lg font-black group-hover:text-[var(--accent)]">What still runs overnight?</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Find routes with sustained scheduled service from 2am to 6am.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]">Explore Night Service <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </a>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
