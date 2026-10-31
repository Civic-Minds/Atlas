import type { ReactNode } from 'react';
import { PageTitle } from '../ui/PageTitle';

/** The small line above every research page's title (Ryan approved, CIV-1176). */
export const RESEARCH_EYEBROW = 'Atlas research';

const WIDTH = {
  /** A story with a wide figure in its header (the Frequent service story): a wider column, the intro held narrower. */
  story: { header: 'max-w-4xl', intro: 'mx-auto mt-6 max-w-2xl' },
  /** A data page: the header and its intro share one column with the content below. */
  page: { header: 'max-w-3xl', intro: 'mt-6' },
} as const;

/**
 * The top of a research page: "Atlas research", the page's title and its intro, centred over the content, with
 * anything the page adds after the intro (a figure, a link). ResearchMethod is the same page's bottom.
 */
export default function ResearchHeader({ title, intro, width = 'page', children }: {
  title: ReactNode;
  /** The intro paragraphs. */
  intro: ReactNode;
  width?: keyof typeof WIDTH;
  /** After the intro, inside the header. */
  children?: ReactNode;
}) {
  const w = WIDTH[width];
  return (
    <header className={`mx-auto ${w.header} text-center`}>
      <p className="text-xs font-black text-[var(--accent)]">{RESEARCH_EYEBROW}</p>
      <PageTitle level="research" className="mt-5">{title}</PageTitle>
      <div className={`${w.intro} space-y-4 text-left text-base leading-8 text-[var(--text-muted)] sm:text-lg`}>
        {intro}
      </div>
      {children}
    </header>
  );
}
