import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';

const headlineVerbs = ['understanding', 'exploring', 'comparing'];

const lenses = [
  { label: 'Frequency', text: 'How often the next vehicle comes.' },
  { label: 'Service span', text: 'When useful service starts and ends.' },
  { label: 'Coverage', text: 'Where the network actually reaches.' },
  { label: 'Modes', text: 'How bus, rail, ferry, and other services differ.' },
  { label: 'History', text: 'How scheduled service changes over time.' },
];

export default function AboutPage() {
  const [headlineVerbIndex, setHeadlineVerbIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeadlineVerbIndex(index => (index + 1) % headlineVerbs.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <SiteHeader />

        <section className="max-w-5xl py-24 sm:py-32">
          <h1 className="max-w-4xl text-5xl font-black tracking-[-0.04em] sm:text-7xl">A map for <span className="block"><span className="inline-block w-[12ch] whitespace-nowrap">{headlineVerbs[headlineVerbIndex]}</span></span>{' '}how transit works.</h1>
          <p className="mt-8 max-w-2xl text-xl leading-8 text-[var(--text-muted)]">Atlas turns published schedules into a clearer picture of where transit goes, how often it comes, and when it is useful.</p>
        </section>

        <section className="grid max-w-4xl gap-8 border-y border-[var(--border-primary)] py-16 sm:grid-cols-[0.75fr_1.25fr]" aria-labelledby="explore-heading">
          <h2 id="explore-heading" className="text-2xl font-black tracking-tight">Atlas brings the pieces together.</h2>
          <div>
            <p className="text-base leading-7 text-[var(--text-muted)]">Together, these views show how a network actually works: where service goes, when it runs, how often it comes, and how it changes over time.</p>
            <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {lenses.map(({ label, text }) => (
                <div key={label} className="border-l-2 border-[var(--accent-border)] pl-4">
                  <h3 className="text-base font-black">{label}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid max-w-4xl gap-8 py-20 sm:grid-cols-[0.75fr_1.25fr]">
          <h2 className="text-2xl font-black tracking-tight">Atlas makes scheduled service easier to understand.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>How often does service come? How late does it run? Which parts of a network are useful without a timetable?</p>
            <p>Atlas brings published agency schedules into one place so riders, planners, researchers, and advocates can compare routes across cities, time periods, and modes. History makes changes visible over time, while Research explains the definitions and evidence behind specific service patterns.</p>
            <p>Atlas does not replace official trip planning, live alerts, or the agencies that publish the schedules.</p>
            <a href="/about/docs" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
              Read how Atlas works <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-y border-[var(--border-primary)] py-12" aria-labelledby="research-heading">
          <h2 id="research-heading" className="text-2xl font-black tracking-tight">See our latest research.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
