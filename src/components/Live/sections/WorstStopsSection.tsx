import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { rankStops, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../../../../shared/liveDashboard';
import { LATE_THRESHOLD } from '../../../../shared/liveWording';
import { liveStopName } from '../../../utils/stopLabel';
import ErrorBoundary from '../../ErrorBoundary';
import ArrowLink from '../../ui/ArrowLink';
import { SectionTitle } from '../../ui/PageTitle';
import SortableDataTable from '../../ui/SortableDataTable';
import { PAGE_FIGURE_COLUMN_REM } from '../../ui/DataTable';
import { PageTable } from '../../ui/PageSection';
import Section from './Section';
import { mins, pct } from './figures';
import { lateShareColor } from '../lateShare';
import LegendItem from '../../ui/LegendItem';
import { LIVE_NO_STOP_TO_RANK } from '../../../content/noticeCopy';
import LateStopsMap from '../LateStopsMapLazy';
import { lateStopDots } from '../lateStopsMapModel';
import { lateMapNote } from '../lateStopsMock';
import { routeMapModel } from '../routeMapModel';

/** The one derivation of the worst-stops list (the stops ranked by share of late departures), so every surface lists the same stops. */
export function worstStopsModel(v3: LiveV3, data: DashboardBandData, dir: number | null, uncertain: readonly UncertainStart[], limit: number) {
  const top = rankStops(data.stops, dir, uncertain).slice(0, limit);
  const hidden = uncertain.filter(u => dir == null || u.directionId === dir);
  return { top, hidden, both: dir == null, directionLabels: v3.directionLabels };
}

const EMPTY = LIVE_NO_STOP_TO_RANK;
/** A figure column's width, the data pages' one (rem). */
const FIGURE = PAGE_FIGURE_COLUMN_REM;

/** The tool panel's short clickable list, built from the same model: a stop name and its late share. */
export function worstStopRows(v3: LiveV3, data: DashboardBandData, dir: number | null, uncertain: readonly UncertainStart[], limit: number, onPick: (stopId: string) => void) {
  return worstStopsModel(v3, data, dir, uncertain, limit).top.map(x => ({ key: x.stopId, label: liveStopName(x.name), value: pct(x.lateShare), onPick: () => onPick(x.stopId) }));
}

/**
 * The stops most often late. `columns` 'compact' is the dashboard's three columns; 'full' adds the late-share bar, the
 * typical delay, the 1-in-10 figure and the departure count. With `id` the list is a titled Section (`shrink`,
 * `boundary` as on Section); without it, it is the dashboard's own card, a section of its own with `footerLink`.
 * `intro` adds the thresholds line; `notRanked` the note about stops whose delay is less exact; `onPick`/`canPick`
 * turn stop names into buttons that choose the stop.
 */
export default function WorstStopsSection({ v3, data, dir, uncertain, limit, columns, title, id, shrink, boundary, intro = false, notRanked = false, onPick, canPick, footerLink, p90Width, map }: {
  v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: readonly UncertainStart[]; limit: number;
  columns: 'compact' | 'full'; title: string; id?: string; shrink?: boolean; boundary?: string;
  intro?: boolean; notRanked?: boolean;
  onPick?: (directionId: number, stopId: string) => void; canPick?: (directionId: number, stopId: string) => boolean;
  footerLink?: { text: string; href: string; onClick: () => void };
  /** The 1-in-10 column's set width (Full analysis sets one; Explore does not). */
  p90Width?: number;
  /**
   * CIV-1405 mock-up: a map of the first `stops` of the list beside the table, the table listing `limit` of them. Each
   * stop's rank is the number on its dot and in front of its name; the route's stops draw its line under the dots.
   */
  map?: { stops: number; band: DashboardBand };
}): ReactNode {
  const listLimit = map ? Math.max(map.stops, limit) : limit;
  const { top: listed, hidden, both, directionLabels } = useMemo(() => worstStopsModel(v3, data, dir, uncertain, listLimit), [v3, data, dir, uncertain, listLimit]);
  const top = listed.slice(0, limit);
  const rankKey = (s: { stopId: string; directionId: number }) => `${s.stopId}-${s.directionId}`;
  const rank = new Map(listed.map((s, i) => [rankKey(s), i + 1]));
  const dirText = (d: number) => directionLabels[String(d)];
  const full = columns === 'full';
  // The share, with the strip's three late colours as a dot (the Full analysis: no bar repeating the number).
  const bar = (share: number) => <LegendItem color={lateShareColor(share)} className="gap-2">{pct(share)}</LegendItem>;
  const table = top.length ? (
    <PageTable>
      <SortableDataTable
        narrowFit
        rowTitle={s => `${s.name}: ${s.n.toLocaleString()} departures`}
        caption={full ? 'Stops ranked by the share of late departures' : 'The five stops with the highest share of late departures'}
        defaultSort="late"
        rows={top}
        rowKey={s => `${s.stopId}-${s.directionId}`}
        columns={[
          onPick && canPick
            ? { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => !canPick(s.directionId, s.stopId) ? s.name : <button type="button" onClick={() => onPick(s.directionId, s.stopId)} className="text-left font-[inherit] hover:underline max-sm:min-h-[44px] max-sm:w-full">{s.name}</button> }
            : map
              ? { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal break-words', cell: s => <span title={s.name} className="flex gap-2"><span className="w-5 shrink-0 whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-muted)]">{rank.get(rankKey(s))}</span><span>{s.name}</span></span> }
              : { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal break-words', cell: s => <span title={s.name}>{s.name}</span> },
          ...(both ? [{ key: 'dir', header: 'Direction', align: 'left' as const, cell: (s: (typeof top)[number]) => directionLabels[String(s.directionId)] }] : []),
          full
            ? { key: 'late', header: 'Late', width: FIGURE, worst: (s: (typeof top)[number]) => s.lateShare, cell: (s: (typeof top)[number]) => bar(s.lateShare) }
            : { key: 'late', header: 'Late', width: FIGURE, worst: (s: (typeof top)[number]) => s.lateShare, cell: (s: (typeof top)[number]) => <span title={`${s.n.toLocaleString()} departures`}>{pct(s.lateShare)}</span> },
          ...(full ? [
            { key: 'median', header: 'Typical delay', width: FIGURE, worst: (s: (typeof top)[number]) => s.medianMin, cell: (s: (typeof top)[number]) => mins(s.medianMin) },
            { key: 'p90', header: '1 in 10 later than', narrowHide: true, width: p90Width ?? FIGURE, worst: (s: (typeof top)[number]) => s.p90Min, cell: (s: (typeof top)[number]) => mins(s.p90Min) },
            { key: 'n', header: 'Departures', narrowHide: true, width: FIGURE, cell: (s: (typeof top)[number]) => s.n.toLocaleString() },
          ] : []),
        ]}
      />
    </PageTable>
  ) : <p className="mt-3 text-sm text-[var(--text-muted)]">{EMPTY}</p>;
  const mapped = map && top.length ? (() => {
    const dots = lateStopDots(listed.slice(0, map.stops), s => ({ key: rankKey(s), lonLat: s.lonLat ?? null, lateShare: s.lateShare, title: `${s.name}${both ? ` (${dirText(s.directionId)})` : ''}: ${pct(s.lateShare)} late` }));
    // The route's line: the planner map's segments (its regular patterns) for each direction shown.
    const dirs = [...new Set(data.stops.map(s => s.directionId))].filter(d => dir == null || d === dir);
    const lines = dirs.flatMap(d => routeMapModel(v3, d, map.band, 'late', uncertain).segments.map(g => g.coordinates));
    return (
      <div className="mt-6 grid gap-6">
        <LateStopsMap dots={dots} lines={lines} label={`Map of the route and the ${dots.length} stops most often late; the table lists the same stops with their figures`} note={lateMapNote(top.length, dots.length)} mapClassName="h-72 lg:h-80" />
        <div className="min-w-0 [&>*]:mt-0">{table}</div>
      </div>
    );
  })() : null;
  const introLine = intro && <p className="mt-2 text-sm text-[var(--text-muted)]">Stops ranked by how often vehicles leave {LATE_THRESHOLD} (stops with 30+ departures).</p>;
  const note = notRanked && hidden.length > 0 && (
    <p className="mt-2 max-w-2xl text-xs text-[var(--text-dim)]">
      Not ranked: the first {hidden[0].stops} stops {hidden.length === 1 ? directionLabels[String(hidden[0].directionId)].toLowerCase() : 'in some directions'}, where delay is less exact (see the note above).
    </p>
  );
  if (id) return <Section id={id} title={title} shrink={shrink} boundary={boundary}>{introLine}{mapped ?? table}{note}</Section>;
  return (
    <section className="mt-12 max-w-xl" aria-label="The stops most often late">
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
