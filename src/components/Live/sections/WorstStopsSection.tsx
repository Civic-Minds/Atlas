import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { rankStops, type DashboardBandData, type LiveV3, type UncertainStart } from '../../../../shared/liveDashboard';
import { shortStopName } from '../../../utils/stopLabel';
import { titleCase } from '../../../utils/format';
import ErrorBoundary from '../../ErrorBoundary';
import ArrowLink from '../../ui/ArrowLink';
import { SectionTitle } from '../../ui/PageTitle';
import SortableDataTable from '../../ui/SortableDataTable';
import Section from './Section';
import { mins, pct } from './figures';

/** The one derivation of the worst-stops list (the stops ranked by share of late departures), so every surface lists the same stops. */
export function worstStopsModel(v3: LiveV3, data: DashboardBandData, dir: number | null, uncertain: readonly UncertainStart[], limit: number) {
  const top = rankStops(data.stops, dir, uncertain).slice(0, limit);
  const hidden = uncertain.filter(u => dir == null || u.directionId === dir);
  return { top, hidden, both: dir == null, directionLabels: v3.directionLabels };
}

const EMPTY = 'No stop has enough departures to rank.';

/** The tool panel's short clickable list, built from the same model: a stop name and its late share. */
export function worstStopRows(v3: LiveV3, data: DashboardBandData, dir: number | null, uncertain: readonly UncertainStart[], limit: number, onPick: (stopId: string) => void) {
  return worstStopsModel(v3, data, dir, uncertain, limit).top.map(x => ({ key: x.stopId, label: shortStopName(titleCase(x.name)), value: pct(x.lateShare), onPick: () => onPick(x.stopId) }));
}

/**
 * The stops most often late. `columns` 'compact' is the dashboard's three columns; 'full' adds the late-share bar, the
 * typical delay, the 1-in-10 figure and the departure count. With `id` the list is a titled Section (`shrink`,
 * `boundary` as on Section); without it, it is the dashboard's own card, a section of its own with `footerLink`.
 * `intro` adds the thresholds line; `notRanked` the note about stops whose delay is less exact; `onPick`/`canPick`
 * turn stop names into buttons that choose the stop.
 */
export default function WorstStopsSection({ v3, data, dir, uncertain, limit, columns, title, id, shrink, boundary, intro = false, notRanked = false, onPick, canPick, footerLink, p90Width }: {
  v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: readonly UncertainStart[]; limit: number;
  columns: 'compact' | 'full'; title: string; id?: string; shrink?: boolean; boundary?: string;
  intro?: boolean; notRanked?: boolean;
  onPick?: (directionId: number, stopId: string) => void; canPick?: (directionId: number, stopId: string) => boolean;
  footerLink?: { text: string; href: string; onClick: () => void };
  /** The 1-in-10 column's set width (Full analysis sets one; Explore does not). */
  p90Width?: number;
}): ReactNode {
  const { top, hidden, both, directionLabels } = useMemo(() => worstStopsModel(v3, data, dir, uncertain, limit), [v3, data, dir, uncertain, limit]);
  const full = columns === 'full';
  const bar = (share: number) => (
    <span className="inline-flex items-center gap-2">
      <span className="block h-2 w-20 rounded-sm bg-[var(--control-inactive-bg)]" aria-hidden="true"><span className="block h-full rounded-sm bg-[var(--accent)] opacity-90" style={{ width: `${Math.max(2, share * 100)}%` }} /></span>
      {pct(share)}
    </span>
  );
  const table = top.length ? (
    <div className={`${full ? 'mt-4' : 'mt-3'} overflow-x-auto`}>
      <SortableDataTable
        caption={full ? 'Stops ranked by the share of late departures' : 'The five stops with the highest share of late departures'}
        defaultSort="late"
        rows={top}
        rowKey={s => `${s.stopId}-${s.directionId}`}
        columns={[
          onPick && canPick
            ? { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => !canPick(s.directionId, s.stopId) ? s.name : <button type="button" onClick={() => onPick(s.directionId, s.stopId)} className="text-left font-[inherit] hover:underline">{s.name}</button> }
            : { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: s => <span title={s.name}>{s.name}</span> },
          ...(both ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof top)[number]) => directionLabels[String(s.directionId)] }] : []),
          full
            ? { key: 'late', header: 'Late', worst: (s: (typeof top)[number]) => s.lateShare, cell: (s: (typeof top)[number]) => bar(s.lateShare) }
            : { key: 'late', header: 'Late', worst: (s: (typeof top)[number]) => s.lateShare, cell: (s: (typeof top)[number]) => <span title={`${s.n.toLocaleString()} departures`}>{pct(s.lateShare)}</span> },
          ...(full ? [
            { key: 'median', header: 'Typical delay', worst: (s: (typeof top)[number]) => s.medianMin, cell: (s: (typeof top)[number]) => mins(s.medianMin) },
            { key: 'p90', header: '1 in 10 later than', ...(p90Width != null ? { width: p90Width } : {}), worst: (s: (typeof top)[number]) => s.p90Min, cell: (s: (typeof top)[number]) => mins(s.p90Min) },
            { key: 'n', header: 'Departures', cell: (s: (typeof top)[number]) => s.n.toLocaleString() },
          ] : []),
        ]}
      />
    </div>
  ) : <p className="mt-3 text-sm text-[var(--text-muted)]">{EMPTY}</p>;
  const introLine = intro && <p className="mt-2 text-sm text-[var(--text-muted)]">Stops ranked by how often vehicles leave {v3.thresholds.lateAtOrAboveMin}+ minutes late (stops with 30+ departures).</p>;
  const note = notRanked && hidden.length > 0 && (
    <p className="mt-2 max-w-2xl text-xs text-[var(--text-dim)]">
      Not ranked: the first {hidden[0].stops} stops {hidden.length === 1 ? directionLabels[String(hidden[0].directionId)].toLowerCase() : 'in some directions'}, where delay is less exact (see the note above).
    </p>
  );
  if (id) return <Section id={id} title={title} shrink={shrink} boundary={boundary}>{introLine}{table}{note}</Section>;
  return (
    <section className="mt-10 max-w-xl" aria-label="The stops most often late">
      <ErrorBoundary label={boundary ?? ''}>
        <div className="min-w-0">
          <SectionTitle>{title}</SectionTitle>
          {table}
          {footerLink && <p className="mt-3"><ArrowLink href={footerLink.href} onClick={(e: MouseEvent) => { e.preventDefault(); footerLink.onClick(); }}>{footerLink.text}</ArrowLink></p>}
        </div>
      </ErrorBoundary>
    </section>
  );
}
