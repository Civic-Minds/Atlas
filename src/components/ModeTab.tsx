import React from 'react';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE } from '../styles';
import { ModeTabLabel, modeTabSpacing } from './ModeTabLabel';

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]';

/**
 * One view tab (Live, History, Compare) in the top bar, or as an item in the phone "More" menu.
 * Every mode switches in place through `onClick` (no page load, so the map stays mounted, #888);
 * none of them is a link.
 */
export default function ModeTab({
  icon, label, extra, active, collapsed = false, onClick, onWarm, ariaLabel, variant = 'bar',
}: {
  icon: React.ReactNode;
  label: string;
  /** Small count after the label, e.g. "7" or "22+". */
  extra?: React.ReactNode;
  active: boolean;
  /** Another mode is active: the bar tab shrinks to its icon. */
  collapsed?: boolean;
  onClick: () => void;
  /** Hover, focus or touch: the user is about to open this mode, so start loading what it needs. */
  onWarm?: () => void;
  ariaLabel?: string;
  variant?: 'bar' | 'menu';
}) {
  const state = active ? APP_TAB_ACTIVE : APP_TAB_INACTIVE;
  const extraEl = extra != null && extra !== '' ? <span className="font-normal text-[var(--text-dim)]">{extra}</span> : null;
  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={onWarm}
        onFocus={onWarm}
        onTouchStart={onWarm}
        aria-pressed={active}
        aria-label={ariaLabel}
        className={`sm:hidden flex h-8 px-3 items-center gap-1.5 rounded-full text-xs font-bold border ${FOCUS} ${state}`}
      >
        {icon}
        <span>{label}</span>
        {extraEl}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      onTouchStart={onWarm}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={collapsed ? label : undefined}
      className={`hidden sm:flex h-8 ${modeTabSpacing(collapsed)} items-center rounded-full shrink-0 transition-colors text-xs font-bold border ${FOCUS} ${state}`}
    >
      {icon}
      <ModeTabLabel collapsed={collapsed}>
        <span>{label}</span>
        {extraEl}
      </ModeTabLabel>
    </button>
  );
}
