import type { ButtonHTMLAttributes } from 'react';
import { CONTROL_ACTIVE } from '../../styles';

const BASE = 'w-7 h-7 flex items-center justify-center rounded-full border transition-colors shrink-0';
const IDLE = 'border-transparent text-[var(--text-dim)] hover:bg-[var(--bg-btn-hover)] hover:text-[var(--text-primary)]';

/**
 * The small round icon button in panel and card headers (close, chart toggle). One look everywhere;
 * `pressed` gives a toggle the shared selected state. Give it an aria-label.
 */
export default function RoundIconButton({ pressed, className = '', ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`${BASE} ${pressed ? CONTROL_ACTIVE : IDLE} ${className}`.trim()}
      {...rest}
    />
  );
}
