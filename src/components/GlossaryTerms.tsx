import { Fragment, type ReactNode } from 'react';

/** One glossary term: its name (for the A–Z order) and its paragraph as shown. */
export interface GlossaryEntry { term: string; node: ReactNode }

/** CIV-3191: the A–Z key, ignoring quote marks (“Every N min” sorts under E) and case. */
export const glossarySortKey = (term: string): string => term.replace(/[“”"‘’']/g, '').toLocaleLowerCase('en');

/** The glossary in one A–Z list (CIV-3191, Ryan, 2026-11-28, picked 1). */
export function sortGlossary<T extends { term: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => glossarySortKey(a.term).localeCompare(glossarySortKey(b.term), 'en'));
}

/** The terms' paragraphs, in the order given. */
export function GlossaryTerms({ entries }: { entries: readonly GlossaryEntry[] }) {
  return <>{entries.map(e => <Fragment key={e.term}>{e.node}</Fragment>)}</>;
}
