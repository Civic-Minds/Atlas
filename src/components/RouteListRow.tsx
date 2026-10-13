import React from 'react';
import { LIST_ROW, LIST_ROW_SPACED, LIST_ROW_PRIMARY, LIST_ROW_DIM, SELECTION_ACTIVE, SELECTION_ACTIVE_TEXT } from '../styles';

interface RouteListRowProps {
  shortName: string;
  name?: string;
  /** Extra line rendered under the primary text (non-stacked mode only); `right` stays the trailing accessory (chevron, stat, etc). */
  subtitle?: React.ReactNode;
  right?: React.ReactNode;  // stats, chevron, headway — caller decides
  onClick?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  selected?: boolean;
  stacked?: boolean;
  variant?: 'divided' | 'spaced';
  className?: string;
}

export default function RouteListRow({
  shortName,
  name,
  subtitle,
  right,
  onClick,
  onHoverChange,
  selected = false,
  stacked = false,
  variant = 'divided',
  className
}: RouteListRowProps) {
  const fullName = name && name !== shortName ? `${shortName} ${name}` : shortName;
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      aria-current={selected ? 'true' : undefined}
      className={`${variant === 'spaced' ? LIST_ROW_SPACED : LIST_ROW} ${stacked || subtitle ? 'items-start' : ''} ${selected ? SELECTION_ACTIVE : ''} ${className ?? ''}`}
    >
      {stacked ? (
        <div className="min-w-0 flex-1">
          <p className={`${LIST_ROW_PRIMARY} line-clamp-2 break-words ${selected ? SELECTION_ACTIVE_TEXT : ''}`} title={fullName}>
            <span>{shortName}</span>
            {name && name !== shortName && (
              <span className={`font-normal ${LIST_ROW_DIM} ml-1.5`}>{name}</span>
            )}
          </p>
          {right}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className={`${LIST_ROW_PRIMARY} line-clamp-2 break-words ${selected ? SELECTION_ACTIVE_TEXT : ''}`} title={fullName}>
              <span>{shortName}</span>
              {name && name !== shortName && (
                <span className={`font-normal ${LIST_ROW_DIM} ml-1.5`}>{name}</span>
              )}
            </p>
            {subtitle}
          </div>
          {right}
        </>
      )}
    </button>
  );
}
