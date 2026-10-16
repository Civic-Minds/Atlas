import type { ReactNode } from 'react';
import PageContents from '../PageContents';
import PageShell from './PageShell';

type ContentsItem = { id: string; label: string };

type Props = {
  /** Extra classes for the content column (text size and colour differ between pages). */
  articleClassName?: string;
  children: ReactNode;
} & (
  | {
      /**
       * Reading pages (Docs, Terms, Privacy, Changelog, Research): a 12rem side column and a 42rem text column.
       * With `contents`, the side column holds the "On this page" menu, which sticks below the sticky site
       * header on wide screens and collapses above the text on phones. Without it the side column stays empty,
       * so the text lines up with the menu pages.
       */
      width?: 'reading';
      contents?: { title?: string; items: readonly ContentsItem[] };
    }
  | {
      /** Data pages (agency, area, agencies index): full-width content in the roomier landing-page gutter. */
      width: 'wide';
      contents?: never;
    }
);

/**
 * The one layout for docs-style pages: page shell, optional section menu, content width and section spacing.
 * The site header stays pinned to the top while scrolling on every page that uses it.
 */
export default function DocsPageLayout({ width = 'reading', contents, articleClassName = '', children }: Props) {
  if (width === 'wide') {
    return (
      <PageShell variant="wide" stickyHeader>
        <article className={`pb-16 pt-10 sm:pt-14 ${articleClassName}`.trim()}>{children}</article>
      </PageShell>
    );
  }
  return (
    <PageShell stickyHeader>
      <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
        {contents && <PageContents title={contents.title} items={contents.items} />}
        <article className={`space-y-8 ${contents ? '' : 'lg:col-start-2'} ${articleClassName}`.replace(/\s+/g, ' ').trim()}>{children}</article>
      </div>
    </PageShell>
  );
}
