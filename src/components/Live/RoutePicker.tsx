import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { AgencySummary } from '../../../shared/liveAgency';
import { routeLabels } from '../../utils/format';
import { SEARCH_FIELD, SEARCH_PILL } from '../../styles';

interface Item { route: string | null; primary: string; secondary?: string }

/**
 * The route switcher for the top bar: the picked route as a button; beneath it a search box (filters by route number or
 * name as you type; arrow keys move, Enter picks, Esc closes) and every route in route-number order, led by "All routes"
 * for the whole network. `route` null is the network.
 */
export default function RoutePicker({ s, route, onPick }: { s: AgencySummary; route: string | null; onPick: (route: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const items: Item[] = useMemo(() => [...s.routes]
    .sort((a, b) => a.route.localeCompare(b.route, undefined, { numeric: true }))
    .map(r => { const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency.toUpperCase() }); return { route: r.route, primary: l.primary, secondary: l.secondary }; }), [s]);
  const q = query.trim().toLowerCase();
  const shown: Item[] = useMemo(() => [
    ...(q ? [] : [{ route: null, primary: 'All routes' } as Item]),
    ...items.filter(i => !q || i.primary.toLowerCase().startsWith(q) || (i.secondary ?? '').toLowerCase().includes(q)),
  ], [items, q]);
  useEffect(() => { setAt(0); }, [q, open]);
  useEffect(() => { if (open) field.current?.focus(); else setQuery(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const current = items.find(i => i.route === route);
  const pick = (i: Item | undefined) => { if (!i) return; setOpen(false); onPick(i.route); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[at]); }
  };
  useEffect(() => { if (open) box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [at, open]);
  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 text-sm hover:border-[var(--accent-border)]">
        <span className="font-bold">{current?.primary ?? 'All routes'}</span>
        {current?.secondary && <span className="text-[var(--text-secondary)]">{current.secondary}</span>}
        <span className="text-xs text-[var(--text-dim)]" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-2 shadow-2xl">
          <div className={SEARCH_PILL}>
            <Search className="h-3 w-3 shrink-0 text-[var(--text-dim)]" />
            <input ref={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className={SEARCH_FIELD} aria-label="Routes" />
            {query && <button type="button" onClick={() => { setQuery(''); field.current?.focus(); }} className="text-[var(--text-dim)] hover:text-[var(--text-primary)]"><X className="h-3 w-3" /></button>}
          </div>
          <ul role="listbox" aria-label="Routes" className="m-0 mt-2 max-h-[60vh] overflow-y-auto p-0">
            {shown.map((i, k) => (
              <li key={i.route ?? 'all'} role="option" aria-selected={k === at} className="list-none">
                <button type="button" tabIndex={-1} onClick={() => pick(i)} onMouseMove={() => setAt(k)}
                  className={`flex w-full items-baseline gap-3 rounded-md px-3 py-1.5 text-left text-sm ${k === at ? 'bg-[var(--accent-selected-bg)]' : ''}`}>
                  <span className={`${i.secondary ? 'w-12 shrink-0' : ''} font-bold`}>{i.primary}</span>
                  {i.secondary && <span className="min-w-0 truncate text-[var(--text-secondary)]">{i.secondary}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
