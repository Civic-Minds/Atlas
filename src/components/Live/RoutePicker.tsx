import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgencyRouteRow, AgencySummary } from '../../../shared/liveAgency';
import { routeLabels } from '../../utils/format';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
/** A route got worse when its late share rose by at least this much since last week (the fixed amount the tiles use for shares). */
export const WORSE_BY = 0.02;

export interface PickerRow { r: AgencyRouteRow; change: number | null }

/** Every route with its late share, worst first, with the routes that got worse this week in their own group on top. */
export function orderRoutes(s: AgencySummary): { worse: PickerRow[]; rest: PickerRow[] } {
  const all = s.routes.map(r => ({ r, change: r.lateShare != null && r.lateLastWeek != null ? r.lateShare - r.lateLastWeek : null }))
    .sort((a, b) => (b.r.lateShare ?? -1) - (a.r.lateShare ?? -1) || a.r.route.localeCompare(b.r.route, undefined, { numeric: true }));
  const worse = all.filter(x => x.change != null && x.change >= WORSE_BY).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  return { worse, rest: all.filter(x => !worse.includes(x)) };
}

/** One route as a single compact line: number, name, late share, and a small arrow for the change since last week. */
function Row({ row, agency, on, onPick }: { row: PickerRow; agency: string; on: boolean; onPick: () => void }) {
  const { r, change } = row;
  const label = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: agency.toUpperCase() });
  const moved = change != null && Math.round(change * 100) !== 0;
  const tone = !moved ? 'text-[var(--text-dim)]' : change! > 0 ? 'text-[var(--status-negative-text)]' : 'text-[var(--status-positive-text)]';
  const title = change == null ? undefined : !moved ? 'same as last week' : `${change > 0 ? '▲' : '▼'} from ${pct(r.lateLastWeek)} last week`;
  return (
    <li className="list-none">
      <button type="button" onClick={onPick} aria-current={on ? 'true' : undefined} title={title}
        className={`grid w-full grid-cols-[3.25rem_minmax(0,1fr)_2.75rem_1rem] items-baseline gap-x-2 rounded-md px-3 py-1.5 text-left text-sm ${on ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
        <span className="font-bold">{label.primary}</span>
        <span className="truncate text-[var(--text-secondary)]">{label.secondary}</span>
        <span className="text-right tabular-nums">{pct(r.lateShare)}</span>
        <span className={`text-xs ${tone}`} aria-hidden="true">{moved ? (change! > 0 ? '▲' : '▼') : ''}</span>
      </button>
    </li>
  );
}

/** The route switcher for the top bar: the picked route as a button, a list of every route beneath it. */
export default function RoutePicker({ s, route, onPick }: { s: AgencySummary; route: string; onPick: (route: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const { worse, rest } = useMemo(() => orderRoutes(s), [s]);
  const current = s.routes.find(r => r.route === route);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const label = current ? routeLabels({ shortName: current.route, longName: current.longName ?? null, mode: current.mode ?? 3, agencyName: s.agency.toUpperCase() }) : null;
  const pick = (r: string) => { setOpen(false); onPick(r); };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 text-sm hover:border-[var(--accent-border)]">
        <span className="font-bold">{label?.primary ?? route}</span>
        {label?.secondary && <span className="text-[var(--text-secondary)]">{label.secondary}</span>}
        <span className="text-xs text-[var(--text-dim)]" aria-hidden="true">▾</span>
      </button>
      {open && (
        <nav aria-label="Routes" className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-2 shadow-2xl">
          {worse.length > 0 && (
            <>
              <h2 className="px-3 pb-1 pt-2 text-sm font-bold">Got worse this week</h2>
              <ul className="m-0 p-0">{worse.map(x => <Row key={x.r.route} row={x} agency={s.agency} on={x.r.route === route} onPick={() => pick(x.r.route)} />)}</ul>
            </>
          )}
          <h2 className="px-3 pb-1 pt-3 text-sm font-bold">All routes</h2>
          <ul className="m-0 p-0">{rest.map(x => <Row key={x.r.route} row={x} agency={s.agency} on={x.r.route === route} onPick={() => pick(x.r.route)} />)}</ul>
        </nav>
      )}
    </div>
  );
}
