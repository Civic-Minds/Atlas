import { useEffect, useState } from 'react';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import { resolveDataRelease } from './lib/dataRelease';
import { buildChangelog } from './lib/changelog';
import { WHATS_NEW, visibleWhatsNew } from './data/whatsNew';
import { FEATURES } from '../shared/config';

type DataRelease = { releaseId?: string; generatedAt?: string };

export default function ChangelogPage({ loadRelease = resolveDataRelease }: { loadRelease?: () => Promise<DataRelease | null> } = {}) {
  const [dataReleases, setDataReleases] = useState<DataRelease[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadRelease()
      .then(release => { if (!cancelled) setDataReleases(release ? [release] : []); })
      .catch(() => { if (!cancelled) setDataReleases([]); });
    return () => { cancelled = true; };
  }, [loadRelease]);

  const entries = buildChangelog(visibleWhatsNew(FEATURES.beta, WHATS_NEW), dataReleases);

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <SiteHeader />
        <section className="pb-16 pt-16 sm:pt-24">
          <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-6xl">Changelog</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-muted)]">What changed in Atlas and when the map data was refreshed, newest first.</p>
          <ol className="mt-12 space-y-10">
            {entries.map(entry => (
              <li key={entry.key} className="border-t border-[var(--border-primary)] pt-5">
                <h2 className="text-lg font-black">
                  {entry.label}
                  {entry.kind === 'app' && <span className="font-semibold text-[var(--text-dim)]"> · {entry.month}</span>}
                </h2>
                {entry.kind === 'app' && (
                  <ul className="mt-4 space-y-3">
                    {entry.items.map(item => (
                      <li key={item.text} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-muted)]">
                        <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                        <span>
                          {item.text}
                          {item.beta && (
                            <span className="ml-2 inline-block rounded-full border border-[var(--accent-border)] px-1.5 py-px text-[10px] font-bold text-[var(--accent)] align-middle">Beta</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
