import type { ReactNode } from 'react';
import { CARD_NOTICE } from '../../styles';

/**
 * What a Live section covers ("both directions · Evening") and the days it leaves out ("Excluding Nov 22"), top right
 * beside the section's title, as the route card names its period. The one place every Live section puts them (Ryan,
 * 2026-11-27: "The placement of 'both directions' differs so much lol"); used by the week table and the late-by-hour chart.
 */
export default function SectionNotes({ scope, excluding }: { scope?: string | null; excluding?: ReactNode }) {
  if (!scope && !excluding) return null;
  return (
    <div className={`${CARD_NOTICE} flex min-w-0 flex-col items-end text-right leading-relaxed`} data-testid="section-notes">
      {scope && <span>{scope}</span>}
      {excluding}
    </div>
  );
}
