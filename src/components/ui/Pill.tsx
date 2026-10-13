import type { ButtonHTMLAttributes } from 'react';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE, CONTROL_ACTIVE, CONTROL_INACTIVE, FILTER_OPTION } from '../../styles';

const SEGMENT = 'h-7 px-2.5 flex items-center justify-center text-xs font-bold rounded-full border transition-colors';
const OUTLINE = 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] disabled:opacity-30 disabled:cursor-default';

interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
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
export default function Pill({ selected = false, tone = 'control', size = 'option', className = '', ...rest }: PillProps) {
  const state = tone === 'outline' ? (selected ? CONTROL_ACTIVE : OUTLINE)
    : tone === 'glass' ? (selected ? APP_TAB_ACTIVE : APP_TAB_INACTIVE)
    : (selected ? CONTROL_ACTIVE : CONTROL_INACTIVE);
  return (
    <button
      type="button"
      aria-pressed={tone === 'outline' && !selected ? undefined : selected}
      className={`${size === 'segment' ? SEGMENT : FILTER_OPTION} ${state} ${className}`.trim()}
      {...rest}
    />
  );
}
