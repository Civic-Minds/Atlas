import React from 'react';
import { LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM } from '../styles';

interface RouteListRowProps {
  shortName: string;
  name?: string;
  right?: React.ReactNode;  // stats, chevron, headway — caller decides
  onClick?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  selected?: boolean;
  stacked?: boolean;
  className?: string;
}

export default function RouteListRow({
  shortName,
  name,
  right,
  onClick,
  onHoverChange,
  selected = false,
  stacked = false,
  className
}: RouteListRowProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      className={`${LIST_ROW} ${stacked ? 'items-start' : ''} ${selected ? 'bg-[var(--accent-bg)]' : ''} ${className ?? ''}`}
    >
      {stacked ? (
        <div className="min-w-0 flex-1">
          <p className={`${LIST_ROW_PRIMARY} truncate ${selected ? 'text-[var(--accent)]' : ''}`}>
            <span>{shortName}</span>
            {name && name !== shortName && (
              <span className={`font-normal ${LIST_ROW_DIM} ml-1.5`}>{name}</span>
            )}
          </p>
          {right}
        </div>
      ) : (
        <>
          <p className={`${LIST_ROW_PRIMARY} truncate min-w-0 flex-1 ${selected ? 'text-[var(--accent)]' : ''}`}>
            <span>{shortName}</span>
            {name && name !== shortName && (
              <span className={`font-normal ${LIST_ROW_DIM} ml-1.5`}>{name}</span>
            )}
          </p>
          {right}
        </>
      )}
    </button>
  );
}
