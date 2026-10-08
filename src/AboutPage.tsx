import { ArrowRight, BookOpen, Clock3, Map, Zap } from 'lucide-react';
import SiteFooter from './components/SiteFooter';

const lenses = [
  { icon: Zap, label: 'Frequency', text: 'How often does the next vehicle come?' },
  { icon: Clock3, label: 'Service span', text: 'When does useful service start and end?' },
  { icon: Map, label: 'Coverage', text: 'Where does the network actually reach?' },
  { icon: Map, label: 'Modes', text: 'How do bus, rail, ferry, and other services differ?' },
  { icon: Clock3, label: 'History', text: 'How has scheduled service changed over time?' },
  { icon: BookOpen, label: 'Research', text: 'How do agencies define and compare service?' },
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

        <section className="mt-14 grid gap-8 rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-7 shadow-xl sm:mt-20 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight sm:text-6xl">Transit is more than lines on a map.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--text-muted)]">
              Atlas turns published schedules into a clearer picture of how transit works: where it goes, how often it comes, and when it is actually useful.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <a href="/" className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-primary)] px-5 text-sm font-black hover:border-[var(--accent-border)]">
                Open the map <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/research" className="inline-flex h-10 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold hover:border-[var(--accent-border)]">
                Explore research
              </a>
            </div>
          </div>

          <div className="border-l border-[var(--border-primary)] pl-5 sm:pl-6">
            <h2 className="text-lg font-black">What you can explore</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6">
              {lenses.map(({ icon: Icon, label, text }) => (
                <div key={label} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <div>
                    <p className="text-sm font-black leading-5">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid max-w-4xl gap-8 py-16 sm:grid-cols-[0.8fr_1.2fr] sm:py-20">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Built for questions a route map cannot answer.</h2>
          </div>
          <div className="space-y-5 text-base leading-7 text-[var(--text-muted)]">
            <p>How often does service come? How late does it run? Which parts of a network are useful without a timetable?</p>
            <p>Atlas uses published agency schedules to make those patterns easier to see. It helps riders, planners, researchers, and advocates understand scheduled service without replacing official trip planning or live alerts.</p>
            <a href="/about/docs" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline">
              Read how Atlas works <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-t border-[var(--border-primary)] py-10">
          <div className="flex items-start gap-4">
            <BookOpen className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />
            <div>
              <h2 className="text-lg font-black">Start with the map. Follow the evidence.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Explore the network first, then open Research when you want to understand how Atlas defines and compares service.</p>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
