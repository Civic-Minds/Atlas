import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuOption<K extends string> { key: K; label: string }

/**
 * A small inline menu: the current choice as text with ▾, opening a list of options. Keyboard: Enter, Space or the
 * arrow keys open it; arrows move; Enter or Space picks; Escape or Tab closes. A menu of radio items for screen readers.
 */
export default function MenuButton<K extends string>({ label, value, options, onChange, className = '' }: {
  /** What the button shows (the current choice, in context). */
  label: string;
  value: K;
  options: readonly MenuOption<K>[];
  onChange: (key: K) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLSpanElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => { if (open) items.current[focus]?.focus(); }, [open, focus]);
  const show = (i: number) => { setFocus(i); setOpen(true); };
  const pick = (k: K) => { onChange(k); setOpen(false); button.current?.focus(); };
  const onButtonKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(Math.max(0, options.findIndex(o => o.key === value))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); show(options.length - 1); }
  };
  const onItemKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((i + 1) % options.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((i - 1 + options.length) % options.length); }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); }
    if (e.key === 'Tab') setOpen(false);
  };
  return (
    <span ref={root} className={`relative inline-block ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : show(Math.max(0, options.findIndex(o => o.key === value))))}
        onKeyDown={onButtonKey}
        className="inline-flex items-center gap-0.5 rounded-sm font-[inherit] text-[var(--text-secondary)] underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {label}<span aria-hidden="true" className="text-[0.75em]">▾</span>
      </button>
      {open && (
        <span id={menuId} role="menu" className="absolute left-0 top-full z-20 mt-1 flex min-w-[9rem] flex-col rounded-md border border-[var(--border-primary)] bg-[var(--bg-header)] py-1 text-sm">
          {options.map((o, i) => (
            <button
              key={o.key}
              ref={el => { items.current[i] = el; }}
              type="button"
              role="menuitemradio"
              aria-checked={o.key === value}
              tabIndex={i === focus ? 0 : -1}
              onClick={() => pick(o.key)}
              onKeyDown={e => onItemKey(e, i)}
              className={`px-3 py-1 text-left hover:bg-[var(--bg-btn-hover)] focus-visible:bg-[var(--bg-btn-hover)] focus-visible:outline-none ${o.key === value ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
            >{o.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
