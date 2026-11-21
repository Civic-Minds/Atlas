import { Fragment, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { StudioSettingsGear } from './StudioSettings';
import { ChipMenu, chipRowClass, useChipRow } from '../../components/Interval/ChipMenu';
import SearchBox from '../../components/ui/SearchBox';

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
  /** A long list that grows (routes): the shared search box on top of the options, as the map's agency selector has one. The hint is a "Find …" line from noticeCopy. */
  searchPlaceholder?: string;
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
export default function StudioChips({ container, menus, settings }: { container: Element | null; menus: ReadonlyArray<StudioMenu | null>; /** The page's own Settings section (CIV-2006). */ settings?: { title: string; content: ReactNode; active?: boolean } }) {
  const { openChip, setOpenChip, toggle, rowRef } = useChipRow<string>();
  if (!container) return null;
  return createPortal(
    <div ref={rowRef} className="hidden sm:flex items-center gap-2 pointer-events-auto">
      {menus.map(m => m && (
        <Fragment key={m.key}>
        <ChipMenu key={m.key} label={m.label} active={m.active ?? true} width={m.width} arrow={m.arrow}
          open={openChip === m.key} onToggle={() => toggle(m.key)} panelClassName={m.panelClassName ?? 'w-56 max-h-[70vh] overflow-y-auto'}>
          {m.content ? m.content(() => setOpenChip(null))
            : m.searchPlaceholder ? <SearchableOptions menu={m} close={() => setOpenChip(null)} />
            : m.options.map(o => <OptionRow key={o[0]} menu={m} option={o} close={() => setOpenChip(null)} />)}
        </ChipMenu>
        {m.after}
        </Fragment>
      ))}
      {/* CIV-2006: the main app's Settings gear, last in the row as on the main map. */}
      <StudioSettingsGear section={settings} />
    </div>,
    container,
  );
}

type Option = StudioMenu['options'][number];

function OptionRow({ menu, option, close }: { menu: StudioMenu; option: Option; close: () => void }) {
  const k = option[0], text = option[1], plain = option.length === 3 ? option[2] : undefined;
  return (
    <button type="button" aria-pressed={k === menu.value} aria-label={plain}
      onClick={() => { menu.onPick(k); close(); }} className={chipRowClass(k === menu.value)}>
      {text}
    </button>
  );
}

/** The map's agency selector's shape for routes: the shared search box, then the matching rows in a list that scrolls inside the dropdown. */
function SearchableOptions({ menu, close }: { menu: StudioMenu; close: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? menu.options.filter(o => (o.length === 3 ? o[2] : o[0]).toLowerCase().includes(q)) : menu.options;
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder={menu.searchPlaceholder!} autoFocus />
      <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-1">
        {shown.map(o => <OptionRow key={o[0]} menu={menu} option={o} close={close} />)}
      </div>
    </>
  );
}
