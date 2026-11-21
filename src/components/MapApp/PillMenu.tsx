import { useEffect, useRef, useState, type ReactNode } from 'react';
import { topBarChipClass } from '../ui/topBarChip';
import { PHONE_TAP_AREA } from '../../styles';

/** A menu choice: its key, what the row shows, and its plain-text name when what it shows is not plain text. */
export type PillMenuOption = readonly [string, ReactNode] | readonly [string, ReactNode, string];

/**
 * One chip showing the current choice; a click opens the choices under it (the map apps' agency, route and time of day
 * menus). The chip is the main map's top-bar chip (topBarChipClass, CIV-1821), filled where its value is set (`active`:
 * a time of day always is, as the main map's Time chip; a route or agency where it isn't the default), with a caret.
 */
export function PillMenu({ label, value, options, onPick, alignRight = false, active = true }: { label: string; value: string; options: ReadonlyArray<PillMenuOption>; onPick: (k: string) => void; alignRight?: boolean; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`${topBarChipClass(active)} ${PHONE_TAP_AREA}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}>
        {options.find(([k]) => k === value)?.[1]}<span aria-hidden="true" className="ml-1">▾</span>
      </button>
      {open && (
        <div role="menu" aria-label={label} className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-50 mt-1 flex min-w-full flex-col gap-0.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-1`}>
          {options.map(([k, text, plain]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={k === value} aria-label={plain} onClick={() => { onPick(k); setOpen(false); }}
              // A finger-sized row on phones (44px), the compact row with a pointer (#1151).
              className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-left text-xs font-bold max-sm:min-h-[44px] ${k === value ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}
