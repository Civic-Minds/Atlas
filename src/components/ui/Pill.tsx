import type { ButtonHTMLAttributes, ElementType } from 'react';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE, CONTROL_ACTIVE, CONTROL_INACTIVE, FILTER_OPTION } from '../../styles';

const SEGMENT = 'h-7 px-2.5 flex items-center justify-center text-xs font-bold rounded-full border transition-colors';
const OUTLINE = 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] disabled:opacity-30 disabled:cursor-default';

interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Render as another element, such as a link ("a"), keeping the pill look. Defaults to a button. */
  as?: ElementType;
  href?: string;
  /** A submit button inside a form (default: a plain button). */
  submit?: boolean;
  /** Selected state; sets aria-pressed. Leave undefined for a plain action pill (tone "outline"). */
  selected?: boolean;
  /**
   * glass: floats over the map or in a filter row (same surface as the app tabs).
   * control: flat in-panel option (CONTROL_ACTIVE / CONTROL_INACTIVE).
   * outline: neutral bordered action such as "All" / "None"; shows the shared selected tint if `selected` is set.
   * Every tone's selected state comes from the --control-active-* tokens (flat tonal tint, full-strength text).
   */
  tone?: 'glass' | 'control' | 'outline';
  /** option: compact py-0.5 pill. segment: h-7 button used in day / time / frequency groups. */
  size?: 'option' | 'segment';
}

/** Compact option pill (text-xs, rounded-full). One component for the filter, option and bulk-action pills. */
export default function Pill({ as: Tag = 'button', submit = false, selected = false, tone = 'control', size = 'option', className = '', ...rest }: PillProps) {
  const state = tone === 'outline' ? (selected ? CONTROL_ACTIVE : OUTLINE)
    : tone === 'glass' ? (selected ? APP_TAB_ACTIVE : APP_TAB_INACTIVE)
    : (selected ? CONTROL_ACTIVE : CONTROL_INACTIVE);
  return (
    <Tag
      {...(Tag === 'button' ? { type: submit ? 'submit' : 'button', 'aria-pressed': tone === 'outline' && !selected ? undefined : selected } : {})}
      className={`${size === 'segment' ? SEGMENT : FILTER_OPTION} ${state} ${className}`.trim()}
      {...rest}
    />
  );
}

/** A row in a top-bar chip's dropdown (ChipMenu), filled where it is the current choice: the control option's colours. */
export const chipRowClass = (active: boolean) =>
  `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all border text-left min-w-0 ${active ? CONTROL_ACTIVE : CONTROL_INACTIVE}`;
