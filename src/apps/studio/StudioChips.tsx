import { Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChipMenu, chipRowClass, useChipRow } from '../../components/Interval/ChipMenu';

/** One of Studio's menus in the top bar: what its chip shows, its choices and the current one. */
export interface StudioMenu {
  key: string;
  /** The menu's name, which its chip shows, as the main map's Frequency, Day and Time chips do. */
  label: string;
  value: string;
  /** Each choice: its key, what its row shows, and its plain-text name when that isn't plain text. */
  options: ReadonlyArray<readonly [string, ReactNode] | readonly [string, ReactNode, string]>;
  onPick: (key: string) => void;
  /** Filled and dotted where its value is set (a route), as the main map's chips; a choice that always has a value is. */
  active?: boolean;
  /** The dropdown's width, and scroll for a long list. */
  panelClassName?: string;
  /** The dropdown's own content in place of the list of options (CIV-1886: the cut-offs' rows of choices); `close` shuts it. */
  content?: (close: () => void) => ReactNode;
  /** One width for the chip and its dropdown, so the chip is at least as wide as its own list (CIV-1889). */
  width?: string;
  /** The chip's dropdown chevron, for a menu that sits among the tabs (Live's Measure, CIV-1889). */
  arrow?: boolean;
  /** Shown right after the chip, outside its dropdown (the agency chip's Source link, CIV-1890). */
  after?: ReactNode;
}

/**
 * Studio's menus (agency, route, time of day) in App's top bar, where the main map's chips sit (CIV-1828): the main map's
 * chip and dropdown (ChipMenu), one open at a time.
 */
export default function StudioChips({ container, menus }: { container: Element | null; menus: ReadonlyArray<StudioMenu | null> }) {
  const { openChip, setOpenChip, toggle, rowRef } = useChipRow<string>();
  if (!container) return null;
  return createPortal(
    <div ref={rowRef} className="hidden sm:flex items-center gap-2 pointer-events-auto">
      {menus.map(m => m && (
        <Fragment key={m.key}>
        <ChipMenu key={m.key} label={m.label} active={m.active ?? true} width={m.width} arrow={m.arrow}
          open={openChip === m.key} onToggle={() => toggle(m.key)} panelClassName={m.panelClassName ?? 'w-56 max-h-[70vh] overflow-y-auto'}>
          {m.content ? m.content(() => setOpenChip(null)) : m.options.map(([k, text, plain]) => (
            <button key={k} type="button" aria-pressed={k === m.value} aria-label={plain}
              onClick={() => { m.onPick(k); setOpenChip(null); }} className={chipRowClass(k === m.value)}>
              {text}
            </button>
          ))}
        </ChipMenu>
        {m.after}
        </Fragment>
      ))}
    </div>,
    container,
  );
}
