import { WhatsNewItemText } from './components/WhatsNewItemText';
import PageContents from './components/PageContents';
import PageShell from './components/ui/PageShell';
import SiteFooter from './components/SiteFooter';
import { buildChangelog } from './lib/changelog';
import { WHATS_NEW, visibleWhatsNew } from './data/whatsNew';
import { FEATURES } from '../shared/config';

export default function ChangelogPage() {
  const entries = buildChangelog(visibleWhatsNew(FEATURES.beta, WHATS_NEW));

  return (
    <PageShell stickyHeader>
        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <PageContents items={entries.map(entry => ({ id: entry.key, label: entry.label }))} />
          <article className="space-y-8 text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Changelog</h1>
              <p className="mt-3">What changed in Atlas.</p>
            </header>
            {entries.map(entry => (
              <section key={entry.key} id={entry.key} className="scroll-mt-24">
                <h2 className="text-base font-black text-[var(--text-primary)] mb-2">
                  {entry.label}
                  <span className="font-normal text-[var(--text-dim)]"> · {entry.month}</span>
                </h2>
                <ul className="list-disc pl-5 space-y-1">
                  {entry.items.map(item => (
                    <li key={item.text}>
                      <WhatsNewItemText item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <SiteFooter />
          </article>
        </div>
    </PageShell>
  );
}
