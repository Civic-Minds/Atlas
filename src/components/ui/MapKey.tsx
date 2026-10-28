import type { ReactNode } from 'react';
import LegendItem from './LegendItem';

/** One step of a map key: a line swatch and its words. */
export interface MapKeyStep {
  color: string;
  label: ReactNode;
  /** Extra classes for this step (its text colour, `flex` for a full-width row). */
  className?: string;
  /** Extra classes for the swatch alone (for example a faded one). */
  swatchClassName?: string;
}

/**
 * A map key (CIV-957): an optional definition, then its steps, each a line swatch and a label from
 * noticeCopy. The frequency key and the research keys (Night, Frequent Service) all draw this; the
 * caller places it (a floating card or a stat pill) and lays out the steps.
 */
export default function MapKey({ definition, steps, stepsClassName = '', after }: {
  /** The key's heading, e.g. "Frequency". */
  definition?: string;
  steps: readonly MapKeyStep[];
  /** Layout of the steps: a grid, or nothing for inline steps. */
  stepsClassName?: string;
  /** More rows under the steps (the frequency key's selected/other split). */
  after?: ReactNode;
}) {
  const items = steps.map((step, i) => (
    <LegendItem key={i} kind="line" color={step.color} className={step.className} swatchClassName={step.swatchClassName}>{step.label}</LegendItem>
  ));
  if (!definition && !after && !stepsClassName) return <>{items}</>;
  return (
    <div className="space-y-1">
      {definition && <p className="text-xs font-bold text-[var(--text-muted)]">{definition}</p>}
      <div className={stepsClassName}>{items}</div>
      {after}
    </div>
  );
}
