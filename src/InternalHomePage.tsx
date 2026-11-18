import PageShell from './components/ui/PageShell';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import AppLink from './components/ui/AppLink';
import { FLOATING_CARD } from './styles';
import { INTERNAL_GROUPS, INTERNAL_HOME_INTRO, INTERNAL_HOME_TITLE } from '../shared/internalPages';
import { useEffect } from 'react';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-1872: the local-only home page. One card per local-only page, in groups, each with a line on what it is. The dev
 * server serves it (main.tsx), and the "Internal" tag beside the Atlas name opens it. Its words are in shared/internalPages.ts.
 */
export default function InternalHomePage() {
  useEffect(() => { document.title = tabTitle(INTERNAL_HOME_TITLE); }, []);
  return (
    <PageShell>
      <main className="mt-8">
        <PageTitle>{INTERNAL_HOME_TITLE}</PageTitle>
        <p className="mt-1 text-sm text-[var(--text-dim)]">{INTERNAL_HOME_INTRO}</p>
        {INTERNAL_GROUPS.map(group => (
          <section key={group.heading} className="mt-8" aria-labelledby={`internal-${group.heading}`}>
            <SectionTitle id={`internal-${group.heading}`} className="mb-3">{group.heading}</SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.pages.map(page => (
                <li key={page.path}>
                  <AppLink to={page.path} className={`${FLOATING_CARD} block p-4 hover:border-[var(--accent)]`}>
                    <span className="block text-sm font-black text-[var(--text-primary)]">{page.title}</span>
                    <span className="mt-1 block text-sm text-[var(--text-dim)]">{page.description}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </PageShell>
  );
}
