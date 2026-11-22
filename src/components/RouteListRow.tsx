import React from 'react';
import { LIST_ROW_DIM, LIST_ROW_PRIMARY, PANEL_SECTION_HEAD, SELECTION_ACTIVE_TEXT } from '../styles';
import ListRow from './ui/ListRow';
import RouteRowName from './RouteRowName';

interface RouteListRowProps {
  shortName: string;
  name?: string;
  /** Extra line rendered under the primary text (non-stacked mode only); `right` stays the trailing accessory (chevron, stat, etc). */
  subtitle?: React.ReactNode;
  right?: React.ReactNode;  // stats, chevron, headway — caller decides
  onClick?: () => void;
  /** Not clickable (e.g. a route the list cannot open). */
  disabled?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  selected?: boolean;
  stacked?: boolean;
  /** Route lists are spaced, with no line between rows (CIV-922); 'divided' keeps the hairline. */
  variant?: 'divided' | 'spaced';
  className?: string;
  /** A colour dot before the name (the route chooser's frequency tier colour). */
  dotColor?: string;
}

export default function RouteListRow({
  shortName,
  name,
  subtitle,
  right,
  onClick,
  disabled,
  onHoverChange,
  selected = false,
  stacked = false,
  variant = 'spaced',
  className,
  dotColor,
}: RouteListRowProps) {
  const fullName = name && name !== shortName ? `${shortName} ${name}` : shortName;
  const text = (
    <p className={`${LIST_ROW_PRIMARY} line-clamp-2 break-words ${selected ? SELECTION_ACTIVE_TEXT : ''}`} title={fullName}>
      {/* text-xs on the name keeps search's row height exactly as it was (its line box is 16px, the label's 15px). */}
      <RouteRowName shortName={shortName} name={name} nameClassName="text-xs" />
    </p>
  );
  // With a subtitle too (CIV-2003, Studio's Schedules), the dot sits on the name's first line and the subtitle lines up
  // under the name; a row with only a dot is unchanged.
  const label = dotColor ? (
    <div className={`flex ${subtitle ? 'items-start' : 'items-center'} gap-2 min-w-0`}>
      <RowDot color={dotColor} className={`shrink-0${subtitle ? ' mt-0.5' : ''}`} />
      {text}
    </div>
  ) : text;
  const sub = subtitle && dotColor ? <div className="pl-4">{subtitle}</div> : subtitle;
  return (
    <ListRow
      variant={variant === 'spaced' ? 'spaced' : 'divided'}
      selected={selected}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      className={`${stacked || subtitle ? 'items-start' : ''} ${className ?? ''}`.trim()}
    >
      {stacked ? (
        <div className="min-w-0 flex-1">
          {label}
          {right}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {label}
            {sub}
          </div>
          {right}
        </>
      )}
    </ListRow>
  );
}

/** A route row's colour dot: before the name, or before a figure in RouteListColumns. */
function RowDot({ color, className }: { color: string; className: string }) {
  return <span className={`w-2 h-2 rounded-full ${className}`} style={{ background: color }} />;
}

/** One figure cell in RouteListColumns: the figure, and a short note under it in the dim row style. */
export interface RouteListCell {
  main: React.ReactNode;
  note?: React.ReactNode;
  /** A colour dot before the figure, as the route rows' dot (Studio's Schedules: the change colour by the newer figure, CIV-2057). */
  dot?: string;
}

/**
 * Figures in fixed columns at a route row's right end, as `right` (CIV-2003: Studio's Schedules, one column per compared
 * date). RouteListHeader names the columns with the same widths, so each figure sits under its heading.
 */
export function RouteListColumns({ cells }: { cells: readonly RouteListCell[] }) {
  return (
    <span className="grid shrink-0 gap-x-2 text-right text-xs" style={{ gridTemplateColumns: `repeat(${cells.length}, 5.25rem)` }}>
      {cells.map((c, i) => (
        <span key={i}>
          <span className="block whitespace-nowrap">
            {c.dot && <RowDot color={c.dot} className="inline-block mr-1 align-middle" />}
            {c.main}
          </span>
          {c.note && <span className={`block whitespace-nowrap ${LIST_ROW_DIM}`}>{c.note}</span>}
        </span>
      ))}
    </span>
  );
}

/** The heading row over a list of RouteListRows with RouteListColumns: the list's name, then each column's. */
export function RouteListHeader({ label, columns }: { label: React.ReactNode; columns: readonly React.ReactNode[] }) {
  return (
    <div className={`${PANEL_SECTION_HEAD} flex items-end justify-between gap-2`}>
      <span>{label}</span>
      <RouteListColumns cells={columns.map(main => ({ main }))} />
    </div>
  );
}
