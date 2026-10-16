import { WhatsNewItemText } from './components/WhatsNewItemText';
import PageContents from './components/PageContents';
import PageShell from './components/ui/PageShell';
import { buildChangelog } from './lib/changelog';
import { WHATS_NEW, visibleWhatsNew } from './data/whatsNew';
import { FEATURES } from '../shared/config';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';

export default function ChangelogPage() {
  const entries = buildChangelog(visibleWhatsNew(FEATURES.whatsNewBetaItems, WHATS_NEW));

  return (
    <PageShell stickyHeader>
        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <PageContents title="Changelog" items={entries.map(entry => ({ id: entry.key, label: entry.label }))} />
          <article className="space-y-8 text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <PageTitle className="text-[var(--text-primary)]">Changelog</PageTitle>
              <p className="mt-3">What changed in Atlas.</p>
            </header>
            {entries.map(entry => (
              <section key={entry.key} id={entry.key} className="scroll-mt-24">
                <SectionTitle level="item" className="mb-2">
                  {entry.label}
                  <span className="font-normal text-[var(--text-dim)]"> · {entry.month}</span>
                </SectionTitle>
                <ul className="list-disc pl-5 space-y-1">
                  {entry.items.map(item => (
                    <li key={item.text}>
                      <WhatsNewItemText item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        </div>
    </PageShell>
  );
}
