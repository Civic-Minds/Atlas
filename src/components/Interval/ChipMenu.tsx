import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { FLOATING_CARD, PANEL_ENTER_TOP } from '../../styles';
import ActiveDot from '../ui/ActiveDot';
import { FEATURES } from '../../../shared/config';
import { topBarChipClass } from '../ui/topBarChip';

/**
 * The top bar's chip with its dropdown, one for every map view (CIV-1828): the main map's Frequency, Day, Time and Mode
 * chips (FilterChips) and Studio's agency, route and time of day menus. A row of chips keeps one open at a time
 * (useChipRow); a click outside the row closes it.
 */

/** The dropdown under a chip. */
export const CHIP_PANEL = `absolute top-10 right-0 ${FLOATING_CARD} p-2 ${PANEL_ENTER_TOP} flex flex-col gap-1`;

/** A row in a chip's dropdown: the shared option style, kept with Pill (sharedUiGuard). */
export { chipRowClass } from '../ui/Pill';

/**
 * The chip's set dot: mounted only while shown, except under mode transitions, where it fades instead of being remounted
 * (CIV-1567, beta).
 */
export function ChipDot({ show }: { show: boolean }) {
  return FEATURES.modeTransitions ? <ActiveDot className={`transition-opacity duration-300 ease-out ${show ? 'opacity-100' : 'opacity-0'}`} /> : show ? <ActiveDot /> : null;
}

/** Which chip of a row is open, and the row's box: a click outside it closes the open one. */
export function useChipRow<K extends string>() {
  const [openChip, setOpenChip] = useState<K | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openChip) return;
    const onClick = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpenChip(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openChip]);
  const toggle = (id: K) => setOpenChip(c => (c === id ? null : id));
  return { openChip, setOpenChip, toggle, rowRef };
}

/**
 * One chip and, while open, its dropdown. `active` fills the chip and shows its dot (a set value). `width` gives the chip
 * and its dropdown one shared width, so the chip is never narrower than its own list (CIV-1889). `arrow` adds the
 * chevron the phone "More" menu's button uses (ModeTab), for a chip that sits among the tabs and must not read as one.
 */
export function ChipMenu({ label, active, open, onToggle, panelClassName, className = '', ariaLabel, width, arrow, children }: {
  label: ReactNode;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  /** The dropdown's width (and scroll, for a long list). */
  panelClassName: string;
  className?: string;
  ariaLabel?: string;
  /** One width (a Tailwind class) for the chip and its dropdown, which then lines up under it. */
  width?: string;
  /** A dropdown chevron after the label, turning up while open. */
  arrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${width ?? ''} ${className}`}>
      <button onClick={onToggle} className={`${topBarChipClass(active)} ${width ? 'w-full' : ''}`} aria-label={ariaLabel}>
        {label}
        {arrow && <ChevronDown className={`ml-1 w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
        <ChipDot show={active} />
      </button>
      {open && <div className={`${CHIP_PANEL} ${panelClassName} ${width ? 'left-0 w-full' : ''}`}>{children}</div>}
    </div>
  );
}
