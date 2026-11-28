import type { ReactNode } from 'react';
import { CARD_NOTICE } from '../../styles';

/**
 * What a Live section covers ("both directions · Evening") and the days it leaves out ("Excluding Nov 22"), on one line
 * under the section's title, the same in every Live section (Ryan, 2026-11-27: "The placement of 'both directions' differs
 * so much lol"). Each part stays whole; in a narrow panel the line breaks only between them, never inside a date.
 */
export default function SectionNotes({ scope, excluding }: { scope?: string | null; excluding?: ReactNode }) {
  if (!scope && !excluding) return null;
  return (
    <div className={`${CARD_NOTICE} flex min-w-0 flex-wrap gap-x-1 leading-relaxed`} data-testid="section-notes">
      {scope && <span className="whitespace-nowrap">{scope}</span>}
      {scope && excluding && <span aria-hidden="true">·</span>}
      {excluding && <span className="whitespace-nowrap">{excluding}</span>}
    </div>
  );
}
