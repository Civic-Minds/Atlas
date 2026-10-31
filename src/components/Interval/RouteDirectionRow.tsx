import React from 'react';
import { heldRowStyles, type HeldSize } from '../../utils/heldLayout';
import { Info } from 'lucide-react';
import { fmtHeadwayRange } from '../../utils/format';
import { shouldShowBranchHeadwayRange } from '../../utils/routeCardTrunk';
import { HeadwayBadge, LimitedBadge } from './cardUi';
import RouteRowName from '../RouteRowName';
import { LIMITED_SERVICE_LABEL, FIRST_LAST_TRIP_ALLOWANCE_HINT } from '../../content/noticeCopy';

interface Props {
  label: string;
  /** In a route list: the route's number and name, drawn as the list rule says ("**504** King", CIV-928) in place of `label`.
   *  Direction rows ("to Broadview") leave it out. */
  routeName?: { shortName: string; name?: string | null };
  /** The label's weight: bold by default; 'regular' for a destination row on the route and stop cards (CIV-918:
   *  bold only for what you scan for, the route number and the frequency). */
  labelWeight?: 'bold' | 'regular';
  /** Keep the label on one line, cut with an ellipsis and named in full on hover, so the badge always fits
   *  beside it (the stop and route cards' destination rows, CIV-918). It keeps 6rem, so a long value
   *  ("every 12 min until 9:37 AM") never squeezes it to a bare ellipsis. */
  singleLine?: boolean;
  /** The value keeps to the right edge when the row wraps it onto a line of its own (Compare, CIV-844). */
  valueEnd?: boolean;
  /** A long value (words such as "every 60 min until 5:05 PM") goes on a line of its own at the right, under the
   *  whole destination name, as Compare's irregular-period rows do (CIV-1143, Ryan 2026-10-30), never "to Centrepoi…". */
  wrapLongValue?: boolean;
  // Regular service
  headway?: number | null;
  colorHeadway?: number | null;
  headwayLabel?: string;
  trunkHeadway?: number | null;  // for range display (every 6–12 min)
  headwaySuffix?: string;
  /** The suffix's colour (HeadwayBadge suffixTone). */
  headwaySuffixTone?: 'dim' | 'negative' | 'positive';
  subLabel?: string;
  /** Text after the sub-label that always stays whole ("· 484 m away"); the sub-label shortens before it does (#1154). */
  subLabelTrailing?: string;
  /** The sub-label's weight: bold by default; 'medium' (the summary weight) for a stop name and distance (CIV-923). */
  subLabelWeight?: 'bold' | 'medium';
  live?: boolean;
  // Limited service
  limited?: boolean;
  /** Words for the limited state; "Irregular" where the filter says the route has none in the period. */
  limitedLabel?: string;
  edgeGapAllowance?: 'opening' | 'closing' | 'both';
  onEdgeGapAllowanceClick?: () => void;
  // Filtering
  dimmed?: boolean;
  // Branch map highlight (#96)
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  branchHovered?: boolean;
  branchDimmed?: boolean;
  onClick?: () => void;
  /** While the sparkline is hovered: keep the row's pre-hover size so the card does not jump. */
  holdLayout?: boolean;
}

/**
 * Keyboard focus shows a row on the map as hovering does (CIV-1053). Only focus the browser marks as
 * keyboard focus (:focus-visible), so a tap on a phone stays a tap.
 */
export function keyboardFocusHover(onHoverStart?: () => void, onHoverEnd?: () => void) {
  if (!onHoverStart || !onHoverEnd) return {};
  return {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      let keyboard = false;
      try { keyboard = e.currentTarget.matches(':focus-visible'); } catch { /* no :focus-visible support */ }
      if (keyboard) onHoverStart();
    },
    onBlur: onHoverEnd,
  };
}

/**
 * Single direction row in the route card panel.
 * Owns label color, headway display, and limited-service variants
 * so there's one place to change instead of hunting across SidebarControls.
 */
/** Longer than this, a value counts as long: a plain value or range ("every 60–120 min", 16) stays beside the name. */
export const LONG_VALUE_CHARS = 16;

export default function RouteDirectionRow({ label, routeName, labelWeight = 'bold', singleLine: singleLineProp = false, valueEnd: valueEndProp = false, wrapLongValue = false, headway, colorHeadway, headwayLabel, trunkHeadway, headwaySuffix, headwaySuffixTone, subLabel, subLabelTrailing, subLabelWeight = 'bold', live, limited, limitedLabel = LIMITED_SERVICE_LABEL, edgeGapAllowance, onEdgeGapAllowanceClick, dimmed, onHoverStart, onHoverEnd, branchHovered, branchDimmed, onClick, holdLayout = false }: Props) {
  const interactive = !!(onHoverStart && onHoverEnd);
  const clickable = !!onClick;
  const faded = dimmed || branchDimmed;
  const showRange = shouldShowBranchHeadwayRange(trunkHeadway, headway);
  const rangeText = showRange && headway != null && trunkHeadway != null
    ? fmtHeadwayRange(trunkHeadway, headway)
    : null;
  const hasValueCell = !!edgeGapAllowance || limited || (headway != null && !showRange) || !!rangeText;
  const valueWords = limited ? limitedLabel : rangeText ?? (headway != null ? headwayLabel : undefined);
  const longValue = wrapLongValue && (valueWords?.length ?? 0) > LONG_VALUE_CHARS;
  const singleLine = singleLineProp && !longValue;
  const valueEnd = valueEndProp || longValue;
  // Measured only while not held, so the held size is always the pre-hover layout.
  const rowRef = React.useRef<HTMLDivElement>(null);
  const valueRef = React.useRef<HTMLSpanElement>(null);
  const heldSize = React.useRef<HeldSize | null>(null);
  React.useLayoutEffect(() => {
    if (holdLayout || !rowRef.current) return;
    heldSize.current = {
      rowHeight: rowRef.current.getBoundingClientRect().height,
      valueWidth: valueRef.current?.getBoundingClientRect().width ?? 0,
    };
  });
  const held = heldRowStyles(holdLayout, heldSize.current);

  return (
    <div
      ref={rowRef}
      style={held.row}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      className={`text-xs transition-opacity duration-150 rounded-lg -mx-1 px-1 py-0.5 ${faded ? 'opacity-35' : ''} ${interactive || clickable ? 'cursor-pointer' : ''} ${branchHovered ? 'bg-[var(--bg-hover)] opacity-100' : ''} ${clickable ? 'hover:text-[var(--accent)]' : ''}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      {...keyboardFocusHover(onHoverStart, onHoverEnd)}
    >
      <div className={`flex ${singleLine ? '' : 'flex-wrap'} items-start justify-between gap-2`}>
        <span
          className={`${labelWeight === 'regular' ? 'font-normal' : 'font-bold'} flex-1 min-w-[6rem] ${longValue ? 'basis-full' : ''} ${singleLine ? 'truncate' : 'break-words'} leading-snug ${clickable ? '' : 'text-[var(--text-primary)]'}`}
          title={singleLine ? label : undefined}
        >
          {routeName ? <RouteRowName shortName={routeName.shortName} name={routeName.name} /> : label}
        </span>
        {hasValueCell && <span ref={valueRef} style={held.value} className={`inline-flex items-center justify-end gap-2 min-w-0 ${valueEnd ? 'ml-auto' : ''}`}>
          {edgeGapAllowance && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdgeGapAllowanceClick?.();
              }}
              className="inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors shrink-0"
              title={FIRST_LAST_TRIP_ALLOWANCE_HINT}
              aria-label="About the first-or-last-trip allowance"
            >
              <Info aria-hidden="true" className="w-3 h-3" />
            </button>
          )}
          {limited && <LimitedBadge label={limitedLabel} />}
          {!limited && headway != null && !showRange && (
            <HeadwayBadge headway={headway} colorHeadway={colorHeadway} live={live} suffix={headwaySuffix} suffixTone={headwaySuffixTone} label={headwayLabel} />
          )}
          {/* The trunk-to-branch range ("every 6–12 min") is the shared badge, coloured by the trunk (CIV-1000). */}
          {!limited && rangeText && <HeadwayBadge headway={trunkHeadway!} label={rangeText} />}
        </span>}
      </div>
      {subLabel && (subLabelTrailing ? (
        <span className={`text-xs ${subLabelWeight === 'medium' ? 'font-medium' : 'font-bold'} text-[var(--text-dim)] flex min-w-0 mt-0.5`}>
          <span className="truncate min-w-0">{subLabel}</span>
          <span className="shrink-0 whitespace-pre">{subLabelTrailing}</span>
        </span>
      ) : (
        <span className={`text-xs ${subLabelWeight === 'medium' ? 'font-medium' : 'font-bold'} text-[var(--text-dim)] block mt-0.5 truncate`}>{subLabel}</span>
      ))}
    </div>
  );
}
