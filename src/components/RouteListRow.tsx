import React from 'react';
import { LIST_ROW_PRIMARY, SELECTION_ACTIVE_TEXT } from '../styles';
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
  const label = dotColor ? (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
      {text}
    </div>
  ) : text;
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
            {subtitle}
          </div>
          {right}
        </>
      )}
    </ListRow>
  );
}
