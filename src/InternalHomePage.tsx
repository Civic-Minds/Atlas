import { useEffect } from 'react';
import DocsPageLayout from './components/ui/DocsPageLayout';
import Card from './components/ui/Card';
import AppLink from './components/ui/AppLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import { INTERNAL_GROUPS, INTERNAL_HOME_INTRO, INTERNAL_HOME_TITLE } from '../shared/internalPages';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-1872: the local-only home page, on the content-page layout, headings and card the rest of the site uses (Ryan: no new
 * sizes). One card per local-only page, in groups, all the same size, each with a line on what it is. The dev server serves
 * it (main.tsx), and the "Internal" tag beside the Atlas name opens it. Its words are in shared/internalPages.ts.
 */
export default function InternalHomePage() {
  useEffect(() => { document.title = tabTitle(INTERNAL_HOME_TITLE); }, []);
  return (
    <DocsPageLayout width="wide">
      <PageTitle>{INTERNAL_HOME_TITLE}</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{INTERNAL_HOME_INTRO}</p>
      {INTERNAL_GROUPS.map(group => (
        <section key={group.heading} className="mt-12" aria-labelledby={`internal-${group.heading}`}>
          <SectionTitle id={`internal-${group.heading}`}>{group.heading}</SectionTitle>
          <ul className="mt-4 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.pages.map(page => (
              <li key={page.path} className="flex">
                {/* One size for every card: the grid rows are equal and each card fills its cell and never goes below the minimum. */}
                <Card as={AppLink} to={page.path} tone="surface" padding="regular" className="block min-h-32 w-full hover:border-[var(--accent)]">
                  <SectionTitle level="item">{page.title}</SectionTitle>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{page.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsPageLayout>
  );
}
