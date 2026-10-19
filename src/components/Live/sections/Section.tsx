import type { ReactNode } from 'react';
import { SectionTitle } from '../../ui/PageTitle';
import ErrorBoundary from '../../ErrorBoundary';

/**
 * A titled page section of the Live route views. `shrink` lets wide content (a table, a chart) narrow inside a grid or
 * flex parent. `boundary` (the message to show) keeps the title on screen if the content fails to draw.
 */
export default function Section({ id, title, shrink = false, boundary, children }: { id: string; title: string; shrink?: boolean; boundary?: string; children: ReactNode }) {
  return (
    <section className={shrink ? 'mt-12 min-w-0' : 'mt-12'} aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {boundary ? <ErrorBoundary label={boundary}>{children}</ErrorBoundary> : children}
    </section>
  );
}
