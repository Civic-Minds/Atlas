import type { ElementType, HTMLAttributes } from 'react';
import { AGENCY_LIST_ROW, LIST_ROW, LIST_ROW_SPACED, SELECTION_ACTIVE } from '../../styles';

const VARIANTS = {
  /** Full-width row with a hairline divider under it. */
  divided: LIST_ROW,
  /** Row separated by whitespace only. */
  spaced: LIST_ROW_SPACED,
  /** Agency browser row (Info and History agency lists). */
  agency: AGENCY_LIST_ROW,
} as const;

interface ListRowProps extends HTMLAttributes<HTMLElement> {
  /** Only meaningful when rendered as a button. */
  disabled?: boolean;
  variant?: keyof typeof VARIANTS;
  /** Marks the row as the current one (selected tint plus aria-current). */
  selected?: boolean;
  /** Render as a button (default, clickable) or a plain div. */
  as?: 'button' | 'div';
}

/** Clickable list row inside a panel. Primary and dim text styles are LIST_ROW_PRIMARY / LIST_ROW_DIM in styles.ts. */
export default function ListRow({ variant = 'divided', selected = false, as = 'button', className = '', ...rest }: ListRowProps) {
  const Tag: ElementType = as;
  return (
    <Tag
      {...(as === 'button' ? { type: 'button' } : {})}
      aria-current={selected ? 'true' : undefined}
      className={`${VARIANTS[variant]} ${selected ? SELECTION_ACTIVE : ''} ${className}`.trim()}
      {...rest}
    />
  );
}
