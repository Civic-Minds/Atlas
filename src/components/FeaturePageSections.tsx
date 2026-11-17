import type { ReactNode } from 'react';
import ArrowLink from './ui/ArrowLink';
import { PageTitle } from './ui/PageTitle';
import ThemedPicture from './ui/ThemedPicture';
import { DOCS_PATH } from '../../shared/pagePaths';
import { coverageAgenciesText, coverageCountriesText } from '../../shared/atlasCoverage';
import { DATA_SOURCE_TITLE, MAP_LINK, READ_HOW_ATLAS_WORKS, dataSourceText } from '../content/noticeCopy';

/**
 * The sections the About, For Transit Planners and For Researchers pages share (CIV-1793), so each is built once: the
 * hero and "Where the Data Comes From" (a text section beside its heading). About keeps its own "Built for looking
 * closer." section: no rule above it and roomier spacing.
 */

/**
 * The hero: the page's title and one grey line, the "Try Atlas" link (plus any `actions` after it), and a picture of
 * the map beside them (CIV-1206 D). `picture` is the path without its ending (ThemedPicture). `boldIntro` sets the line
 * in the bold lead style instead of grey (For Researchers, Ryan's CIV-1793 Q10 pick).
 */
export function PageHero({ title, intro, picture, actions, boldIntro = false }: { title: ReactNode; intro: ReactNode; picture: string; actions?: ReactNode; boldIntro?: boolean }) {
  return (
    <section className="grid gap-12 border-b border-[var(--border-primary)] pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
      <div>
        <PageTitle level="hero">{title}</PageTitle>
        <p className={`mt-8 max-w-2xl text-lg leading-8 ${boldIntro ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{intro}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <ArrowLink href="/">{MAP_LINK}</ArrowLink>
          {actions}
        </div>
      </div>
      <ThemedPicture base={picture} ext="webp" className="block aspect-[10/9] w-full rounded-2xl border sm:aspect-[16/9] lg:aspect-[10/9] border-[var(--border-primary)] object-cover" />
    </section>
  );
}

/** A text section beside its heading, with a rule above it. */
function TextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-[var(--border-primary)] py-12 sm:py-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
      <h2 className="max-w-xs text-2xl font-black tracking-tight">{title}</h2>
      <div className="space-y-4 text-base leading-7 text-[var(--text-muted)]">{children}</div>
    </section>
  );
}

/** How many agencies Atlas covers and where its data comes from, with About's Docs link to the Docs section on it (CIV-1724). */
export function DataSourceSection() {
  return (
    <TextSection title={DATA_SOURCE_TITLE}>
      <p>{dataSourceText(coverageAgenciesText(), coverageCountriesText())}</p>
      <ArrowLink href={`${DOCS_PATH}#data-flow`}>{READ_HOW_ATLAS_WORKS}</ArrowLink>
    </TextSection>
  );
}
