import type { ReactNode } from 'react';
import PageSection from '../../ui/PageSection';
import ErrorBoundary from '../../ErrorBoundary';

/**
 * A titled page section of the Live route views: the data pages' shared section (PageSection), with an error boundary. `shrink` lets wide content (a table, a chart) narrow inside a grid or
 * flex parent. `boundary` (the message to show) keeps the title on screen if the content fails to draw.
 */
export default function Section({ id, title, intro, shrink = false, boundary, children }: {
  id: string; title: string;
  /** The line under the title that says what the section shows. */
  intro?: ReactNode;
  shrink?: boolean; boundary?: string; children: ReactNode;
}) {
  return (
    <PageSection id={id} title={title} intro={intro} shrink={shrink}>
      {boundary ? <ErrorBoundary label={boundary}>{children}</ErrorBoundary> : children}
    </PageSection>
  );
}
