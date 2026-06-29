import React from 'react';
import { LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM } from '../styles';

interface RouteListRowProps {
  shortName: string;
  name?: string;
  right?: React.ReactNode;  // stats, chevron, headway — caller decides
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export default function RouteListRow({
  shortName,
  name,
  right,
  onClick,
  selected = false,
  className
}: RouteListRowProps) {
  return (
    <button
      onClick={onClick}
      className={`${LIST_ROW} ${selected ? 'bg-[var(--accent-bg)]' : ''} ${className ?? ''}`}
    >
      <p className={`${LIST_ROW_PRIMARY} truncate min-w-0 flex-1 ${selected ? 'text-[var(--accent)]' : ''}`}>
        <span>{shortName}</span>
        {name && name !== shortName && (
          <span className={`font-normal ${LIST_ROW_DIM} ml-1.5`}>{name}</span>
        )}
      </p>
      {right}
    </button>
  );
}
