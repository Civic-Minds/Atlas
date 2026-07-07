import React from 'react';
import { getTierColor } from '../../utils/colors';
import { fmtHeadway, fmtHeadwayRange } from '../../utils/format';
import { headwayToTierColor } from './HeadwaySparkline';

interface Props {
  label: string;
  // Regular service
  headway?: number | null;
  trunkHeadway?: number | null;  // for range display (every 6–12 min)
  // Limited service
  limited?: boolean;
  limitedHint?: boolean;  // inline hint row (dot + label + "limited" badge)
  // Filtering
  dimmed?: boolean;
  // Branch map highlight (#96)
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  branchHovered?: boolean;
  branchDimmed?: boolean;
}

/**
 * Single direction row in the route card panel.
 * Owns label color, headway display, and limited-service variants
 * so there's one place to change instead of hunting across SidebarControls.
 */
export default function RouteDirectionRow({ label, headway, trunkHeadway, limited, limitedHint, dimmed, onHoverStart, onHoverEnd, branchHovered, branchDimmed }: Props) {
  const interactive = !!(onHoverStart && onHoverEnd);
  const faded = dimmed || branchDimmed;
  const showRange = trunkHeadway != null && headway != null
    && trunkHeadway < headway * 0.65
    && headway / trunkHeadway <= 4;
  const dotColor = limited ? getTierColor(null) : headwayToTierColor(showRange ? trunkHeadway! : headway);
  const headwayText = limited
    ? 'limited'
    : headway != null
      ? (showRange ? fmtHeadwayRange(trunkHeadway!, headway) : fmtHeadway(headway))
      : null;

  if (limitedHint) {
    return (
      <div className="flex items-start gap-1.5 text-[10px]">
        <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: getTierColor(null) }} />
        <span className="font-bold text-[var(--text-primary)] leading-snug">{label}</span>
        <span className="ml-1.5 text-[8px] font-bold text-[var(--text-legend)] border border-[var(--border-primary)] rounded-full px-1.5 py-px whitespace-nowrap">limited</span>
      </div>
    );
  }

  return (
    <div
      className={`text-[11px] transition-opacity duration-150 rounded-lg -mx-1 px-1 py-0.5 ${faded ? 'opacity-35' : ''} ${interactive ? 'cursor-default' : ''} ${branchHovered ? 'bg-[var(--bg-hover)] opacity-100' : ''}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <span className="font-bold text-[var(--text-primary)] block break-words">{label}</span>
      {headwayText != null && (
        <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
          {headwayText}
        </span>
      )}
    </div>
  );
}
