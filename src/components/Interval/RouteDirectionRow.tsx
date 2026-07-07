import React from 'react';
import { getTierColor } from '../../utils/colors';
import { fmtHeadwayRange } from '../../utils/format';
import { headwayToTierColor } from './HeadwaySparkline';
import { HeadwayBadge } from './cardUi';

interface Props {
  label: string;
  // Regular service
  headway?: number | null;
  trunkHeadway?: number | null;  // for range display (every 6–12 min)
  headwaySuffix?: string;
  subLabel?: string;
  live?: boolean;
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
  allowTrunkRange?: boolean;
  onClick?: () => void;
}

/**
 * Single direction row in the route card panel.
 * Owns label color, headway display, and limited-service variants
 * so there's one place to change instead of hunting across SidebarControls.
 */
export default function RouteDirectionRow({ label, headway, trunkHeadway, headwaySuffix, subLabel, live, limited, limitedHint, dimmed, onHoverStart, onHoverEnd, branchHovered, branchDimmed, allowTrunkRange, onClick }: Props) {
  const interactive = !!(onHoverStart && onHoverEnd);
  const clickable = !!onClick;
  const faded = dimmed || branchDimmed;
  const showRange = trunkHeadway != null && headway != null
    && trunkHeadway < headway * 0.65
    && headway / trunkHeadway <= 4
    && (allowTrunkRange || headway < 20);
  const dotColor = limited ? getTierColor(null) : headwayToTierColor(showRange ? trunkHeadway! : headway);
  const rangeText = !limited && headway != null && showRange
    ? fmtHeadwayRange(trunkHeadway!, headway)
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
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      className={`text-[11px] transition-opacity duration-150 rounded-lg -mx-1 px-1 py-0.5 ${faded ? 'opacity-35' : ''} ${interactive || clickable ? 'cursor-pointer' : ''} ${branchHovered ? 'bg-[var(--bg-hover)] opacity-100' : ''} ${clickable ? 'hover:text-[var(--accent)]' : ''}`}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-bold flex-1 min-w-0 leading-snug break-words ${clickable ? '' : 'text-[var(--text-primary)]'}`}>
          {label}
        </span>
        {limited && (
          <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--text-primary)] leading-snug shrink-0 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
            limited
          </span>
        )}
        {!limited && headway != null && !showRange && (
          <HeadwayBadge headway={headway} live={live} suffix={headwaySuffix} />
        )}
        {!limited && rangeText && (
          <span className="inline-flex items-center gap-1 font-black text-[var(--text-primary)] text-[11px] leading-snug shrink-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
            <span className="whitespace-nowrap">{rangeText}</span>
          </span>
        )}
      </div>
      {subLabel && (
        <span className="text-[9px] font-bold text-[var(--text-dim)] block mt-0.5 truncate">{subLabel}</span>
      )}
    </div>
  );
}
