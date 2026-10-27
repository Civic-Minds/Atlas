import React from 'react';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE } from '../styles';
import { ModeTabLabel, modeTabSpacing, modeTabCollapsed, useModeTabsCollapseOthers, NARROW_TOP_BAR_QUERY, COMPACT_TOP_BAR_QUERY } from './ModeTabLabel';
import { useMediaQuery } from '../hooks/useMediaQuery';

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]';

/**
 * A collapsed tab shows its name while hovered or keyboard-focused (the label in ModeTabLabel
 * opens), and the controls to its right move over to make room. Tailwind only applies `hover:` on
 * devices that can hover, so touch screens never expand it.
 */
/** The phone pill shape shared by the "More" menu's button and the tabs inside that menu. */
const PHONE_PILL = 'flex h-8 px-3 items-center gap-1.5 rounded-full text-xs font-bold border';

const MODE_TAB_PEEK = 'hover:gap-1.5 focus-visible:gap-1.5 hover:pr-3 focus-visible:pr-3';

/**
 * One view tab (Live, History, Compare) in the top bar, or as an item in the phone "More" menu.
 * Every mode switches in place through `onClick` (no page load, so the map stays mounted, #888);
 * none of them is a link. `variant="menu-trigger"` is the phone top bar's button that opens that
 * menu: it names the current mode, takes `expanded` and a `trailing` chevron, and is not a toggle.
 */
export default function ModeTab({
  icon, label, extra, active, onClick, onWarm, ariaLabel, variant = 'bar', expanded, trailing,
}: {
  icon?: React.ReactNode;
  label: string;
  /** Small count after the label, e.g. "7" or "22+". */
  extra?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  /** Hover, focus or touch: the user is about to open this mode, so start loading what it needs. */
  onWarm?: () => void;
  ariaLabel?: string;
  variant?: 'bar' | 'menu' | 'menu-trigger';
  /** menu-trigger only: whether the menu it opens is open. */
  expanded?: boolean;
  /** menu-trigger only: shown after the label (the chevron). */
  trailing?: React.ReactNode;
}) {
  // Shrinks to its icon while a non-map view is on, or on a narrow top bar, and this tab is not the selected one; on a compact top bar the selected one shrinks too.
  const collapsed = modeTabCollapsed(true, useModeTabsCollapseOthers(), active, useMediaQuery(NARROW_TOP_BAR_QUERY), useMediaQuery(COMPACT_TOP_BAR_QUERY));
  const state = active ? APP_TAB_ACTIVE : APP_TAB_INACTIVE;
  const extraEl = extra != null && extra !== '' ? <span className="font-normal text-[var(--text-dim)]">{extra}</span> : null;
  if (variant === 'menu-trigger') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        className={`${PHONE_PILL} max-sm:h-[32px] shrink-0 transition-colors ${FOCUS} ${state}`}
      >
        {icon}
        <span>{label}</span>
        {trailing}
      </button>
    );
  }
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
        className={`sm:hidden ${PHONE_PILL} ${FOCUS} ${state}`}
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
      className={`group/tab hidden sm:flex h-8 ${modeTabSpacing(collapsed)} items-center rounded-full shrink-0 transition-[color,background-color,border-color,padding,gap] duration-200 ease-out motion-reduce:transition-none text-xs font-bold border ${FOCUS} ${state} ${collapsed ? MODE_TAB_PEEK : ''}`}
    >
      {icon}
      <ModeTabLabel collapsed={collapsed}>
        <span>{label}</span>
        {extraEl}
      </ModeTabLabel>
    </button>
  );
}
