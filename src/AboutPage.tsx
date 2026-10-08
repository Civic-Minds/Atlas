import { ArrowRight, BookOpen, Clock3, Map } from 'lucide-react';
import SiteFooter from './components/SiteFooter';

const pillars = [
  { icon: Map, title: 'See the network', text: 'Compare scheduled routes across agencies, cities, and regions.' },
  { icon: Clock3, title: 'See when it runs', text: 'Move through the day to see where service holds together.' },
  { icon: BookOpen, title: 'Understand the evidence', text: 'Read the sources, definitions, and limits behind each view.' },
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

        <section className="max-w-3xl py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl font-black tracking-tight sm:text-6xl">See the service behind the map.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
            Atlas turns published schedules into a map you can explore by frequency, time of day, agency, and place.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <a href="/" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-primary)] px-5 text-sm font-black hover:border-[var(--accent-border)]">
              Open the map <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/research" className="inline-flex h-10 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold hover:bg-[var(--bg-btn-hover)]">
              Explore research
            </a>
          </div>
        </section>

        <section className="grid gap-4 border-y border-[var(--border-primary)] py-6 sm:grid-cols-3" aria-label="What Atlas shows">
          {pillars.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 py-2 sm:block sm:pr-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)] sm:mt-0" />
              <div>
                <h2 className="text-base font-black sm:mt-5">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{text}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="grid max-w-4xl gap-8 py-16 sm:grid-cols-[0.8fr_1.2fr] sm:py-20">
          <h2 className="text-2xl font-black tracking-tight">Built for questions a route map cannot answer.</h2>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>How often does service come? How late does it run? Which parts of a network are useful without a timetable?</p>
            <p>Atlas uses published agency schedules to make those patterns easier to see. It is a way to understand scheduled service, not a replacement for official trip planning or live alerts.</p>
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
