import type { ReactNode } from 'react';
import { SectionTitle } from '../../ui/PageTitle';

/** A titled page section of the Live route views. `shrink` lets wide content (a table, a chart) narrow inside a grid or flex parent. */
export default function Section({ id, title, shrink = false, children }: { id: string; title: string; shrink?: boolean; children: ReactNode }) {
  return (
    <section className={shrink ? 'mt-12 min-w-0' : 'mt-12'} aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}
