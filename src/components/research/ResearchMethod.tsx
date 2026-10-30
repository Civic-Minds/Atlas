import type { ReactNode } from 'react';

/**
 * "How we did this" at the bottom of every research page (CIV-1167). Each part is a paragraph that opens with its
 * bold label, always in this order; an optional part shows only when a page passes it. Labels and order are
 * Editorial's template, approved by Ryan on 2026-10-30.
 */
export interface ResearchMethodParts {
  dateConducted: ReactNode;
  /** Only on pages whose sources were checked again. */
  dateUpdated?: ReactNode;
  /** How many agencies were checked and what kind of source, numbers fed from the page's data. Empty on every page
   *  until Ryan approves Editorial's wording; its place in the order is provisional. */
  whatWeChecked?: ReactNode;
  sample: ReactNode;
  sources: ReactNode;
  whatCounted: ReactNode;
  /** When one agency has more than one value. */
  numbers?: ReactNode;
  /** When some agencies have no result. */
  notFound?: ReactNode;
  /** When the sources were checked again later. */
  rechecked?: ReactNode;
  limitations: ReactNode;
}

const PARTS: ReadonlyArray<[keyof ResearchMethodParts, string]> = [
  ['dateConducted', 'Date conducted.'],
  ['dateUpdated', 'Date updated.'],
  ['whatWeChecked', 'What we checked.'],
  ['sample', 'Sample.'],
  ['sources', 'Sources.'],
  ['whatCounted', 'What counted.'],
  ['numbers', 'How we handled numbers.'],
  ['notFound', 'Not found yet.'],
  ['rechecked', 'Rechecked.'],
  ['limitations', 'Limitations.'],
];

/** The heading and the parts. No outer margin or border: the page (or its layout's method slot) places it. */
export default function ResearchMethod({ parts }: { parts: ResearchMethodParts }) {
  return (
    <section aria-labelledby="research-method-heading">
      <h2 id="research-method-heading" className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">How we did this</h2>
      <div className="mt-5 space-y-5 text-sm sm:text-base leading-7 sm:leading-8 text-[var(--text-muted)]">
        {PARTS.filter(([key]) => parts[key] != null).map(([key, label]) => (
          <p key={key}><strong className="text-[var(--text-primary)]">{label}</strong> {parts[key]}</p>
        ))}
      </div>
    </section>
  );
}
