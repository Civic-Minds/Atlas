import { ArrowRight, Map } from 'lucide-react';
import SiteFooter from './components/SiteFooter';

const lenses = [
  { label: 'Frequency', text: 'How often the next vehicle comes.' },
  { label: 'Service span', text: 'When useful service starts and ends.' },
  { label: 'Coverage', text: 'Where the network actually reaches.' },
  { label: 'Modes', text: 'How bus, rail, ferry, and other services differ.' },
  { label: 'History', text: 'How scheduled service changes over time.' },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <header>
          <a href="/" className="flex items-center gap-3 text-sm font-black">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--bg-app)]">
              <Map className="h-4 w-4" />
            </span>
            <span>Atlas <span className="font-normal text-[var(--text-dim)]">by Civic Minds</span></span>
          </a>
        </header>

        <section className="grid gap-10 py-24 sm:py-32 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-5xl font-black tracking-[-0.04em] sm:text-7xl">A map for understanding how transit works.</h1>
          </div>
          <div className="max-w-md pb-1">
            <p className="text-lg leading-8 text-[var(--text-muted)]">Atlas turns published schedules into a clearer picture of where transit goes, how often it comes, and when it is useful.</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <a href="/" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-primary)] px-5 text-sm font-black hover:border-[var(--accent-border)]">
                Open the map <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/research" className="inline-flex h-10 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold hover:border-[var(--accent-border)]">
                Explore research
              </a>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border-primary)] py-8" aria-labelledby="explore-heading">
          <h2 id="explore-heading" className="text-xl font-black">Different ways to understand the network.</h2>
          <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {lenses.map(({ label, text }) => (
              <div key={label} className="border-l-2 border-[var(--accent-border)] pl-4">
                <h3 className="text-base font-black">{label}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 border-b border-[var(--border-primary)] py-12 sm:grid-cols-[1.25fr_0.75fr]" aria-labelledby="research-heading">
          <div className="sm:order-1">
            <p className="max-w-2xl text-base leading-7 text-[var(--text-muted)]">Read how agencies define frequent and overnight service, then explore the evidence and methods behind Atlas’s research views.</p>
            <a href="/research" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
              Explore Research <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <h2 id="research-heading" className="text-2xl font-black tracking-tight sm:order-2 sm:text-right">Research the patterns behind the map.</h2>
        </section>

        <section className="grid max-w-4xl gap-8 py-20 sm:grid-cols-[0.75fr_1.25fr]">
          <h2 className="text-2xl font-black tracking-tight">Atlas makes scheduled service easier to understand.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>How often does service come? How late does it run? Which parts of a network are useful without a timetable?</p>
            <p>It helps riders, planners, researchers, and advocates compare service across places and time. Atlas does not replace official trip planning, live alerts, or the agencies that publish the schedules.</p>
            <a href="/about/docs" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
              Read how Atlas works <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
