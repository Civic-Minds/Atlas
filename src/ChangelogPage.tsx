import { useEffect, useState } from 'react';
import PageContents from './components/PageContents';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import { loadDataReleases } from './lib/dataRelease';
import { buildChangelog } from './lib/changelog';
import { WHATS_NEW, visibleWhatsNew } from './data/whatsNew';
import { FEATURES } from '../shared/config';

type DataRelease = { releaseId?: string; generatedAt?: string };

export default function ChangelogPage({ loadReleases = loadDataReleases }: { loadReleases?: () => Promise<DataRelease[]> } = {}) {
  const [dataReleases, setDataReleases] = useState<DataRelease[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadReleases()
      .then(releases => { if (!cancelled) setDataReleases(releases); })
      .catch(() => { if (!cancelled) setDataReleases([]); });
    return () => { cancelled = true; };
  }, [loadReleases]);

  const entries = buildChangelog(visibleWhatsNew(FEATURES.beta, WHATS_NEW), dataReleases);

  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <SiteHeader />
        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <PageContents items={entries.map(entry => ({ id: entry.key, label: entry.label }))} />
          <article className="space-y-8 text-sm leading-relaxed text-[var(--text-dim)]">
            <header>
              <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">Changelog</h1>
              <p className="mt-3">What changed in Atlas and when the map data was refreshed, newest first.</p>
            </header>
            {entries.map(entry => (
              <section key={entry.key} id={entry.key} className="scroll-mt-8">
                <h2 className="text-base font-black text-[var(--text-primary)] mb-2">
                  {entry.label}
                  {entry.kind === 'app' && <span className="font-normal text-[var(--text-dim)]"> · {entry.month}</span>}
                </h2>
                {entry.kind === 'app' && (
                  <ul className="list-disc pl-5 space-y-1">
                    {entry.items.map(item => (
                      <li key={item.text}>
                        {item.text}
                        {item.beta && <span className="ml-2 text-xs font-bold text-[var(--accent)]">Beta</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <SiteFooter />
          </article>
        </div>
      </div>
    </main>
  );
}
