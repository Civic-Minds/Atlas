import React from 'react';

interface Props {
  label: string;
  className?: string;
}

/** Destination/headsign label — always primary text so it never looks disabled. */
export default function DirectionLabel({ label, className = '' }: Props) {
  return (
    <span className={`font-bold text-[var(--text-primary)] block break-words ${className}`}>
      {label}
    </span>
  );
}
