import React from 'react';
import { Radio } from 'lucide-react';
import { fmtHeadway } from '../../utils/format';
import { headwayToTierColor } from './HeadwaySparkline';
import { PANEL_ENTER_LEFT } from '../../styles';

export { default as CardDirectionRow } from './RouteDirectionRow';

export const CARD_EYEBROW = 'text-xs font-bold text-[var(--text-muted)] leading-tight mb-0.5';
export const CARD_TITLE = 'text-sm font-black text-[var(--text-primary)] leading-tight';
export const CARD_LIST_ROUTE = 'text-[11px] font-bold text-[var(--text-primary)] leading-snug';
export const CARD_SECTION = 'text-[9px] font-black uppercase tracking-wider text-[var(--text-dim)]';

export function HeadwayBadge({
  headway,
  live,
  suffix,
  className = '',
}: {
  headway: number;
  live?: boolean;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 font-black text-[var(--text-primary)] text-[11px] leading-snug shrink-0 ${className}`}>
      {live && <Radio className="w-2.5 h-2.5 text-[var(--accent)] shrink-0" aria-label="Live data available" />}
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: headwayToTierColor(headway) }} />
      <span className="whitespace-nowrap">{fmtHeadway(headway)}</span>
      {suffix && <span className="text-[9px] font-bold text-[var(--text-dim)] whitespace-nowrap">{suffix}</span>}
    </span>
  );
}

export function CardEyebrow({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${CARD_EYEBROW} hover:text-[var(--accent)] transition-colors text-left block ${className}`}
      >
        {children}
      </button>
    );
  }
  return <p className={`${CARD_EYEBROW} truncate ${className}`}>{children}</p>;
}

export function CardTitle({
  children,
  onClick,
  clamp = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  clamp?: boolean;
  className?: string;
}) {
  const cls = `${CARD_TITLE}${clamp ? ' line-clamp-2' : ''} ${className}`;
  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} hover:text-[var(--accent)] transition-colors text-left mb-1.5 block`}>
        {children}
      </button>
    );
  }
  return <h3 className={`${cls} mb-2`}>{children}</h3>;
}

/** Agency eyebrow + primary title — route cards, single-agency stop headers. */
export function SidebarCardHeader({
  eyebrow,
  title,
  onEyebrowClick,
  titleClamp = false,
}: {
  eyebrow?: string | null;
  title: string;
  onEyebrowClick?: () => void;
  titleClamp?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      {eyebrow && <CardEyebrow onClick={onEyebrowClick}>{eyebrow}</CardEyebrow>}
      <CardTitle clamp={titleClamp} className={eyebrow ? 'mb-0' : 'mb-2'}>{title}</CardTitle>
    </div>
  );
}

export function CardSectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`${CARD_SECTION} mb-2 ${className}`}>{children}</div>;
}

export function CardDivider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-[var(--border-primary)] opacity-30 ${className}`} />;
}

export function AgencyFilterChips({
  agencies,
  selected,
  onSelect,
}: {
  agencies: string[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mb-0.5">
      {agencies.map((name, i) => (
        <React.Fragment key={name}>
          <button
            onClick={() => onSelect(selected === name ? null : name)}
            className={`text-xs font-bold transition-colors ${
              selected === name
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {name}
          </button>
          {i < agencies.length - 1 && (
            <span className="text-xs text-[var(--border-primary)] select-none">·</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DataOverrideLink({ issueUrl }: { issueUrl: string }) {
  return (
    <a
      href={issueUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-0.5 block"
    >
      We corrected this data
    </a>
  );
}

/** Sidebar panel shell — stop card, route card (#103). */
export function SidebarCardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-5 ${PANEL_ENTER_LEFT} ${className}`}>{children}</div>;
}

export function SidebarCardHeaderBlock({ children }: { children: React.ReactNode }) {
  return <div className="mb-1">{children}</div>;
}

export function SidebarCardList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-3 ${className}`}>{children}</div>;
}

export function SidebarCardListRows({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className}`}>{children}</div>;
}

export function SidebarCardSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-primary)]">
      {label && <CardSectionLabel>{label}</CardSectionLabel>}
      <SidebarCardListRows>{children}</SidebarCardListRows>
    </div>
  );
}

const CARD_SUBLINE = 'text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors leading-snug';

/** Route label + headway on one row (stop card groups). */
export function CardSummaryRow({
  label,
  onClick,
  headway,
  live,
  headwaySuffix,
  below,
}: {
  label: React.ReactNode;
  onClick?: () => void;
  headway?: number | null;
  live?: boolean;
  headwaySuffix?: string;
  below?: React.ReactNode;
}) {
  const labelCls = `${CARD_LIST_ROUTE} block text-left w-full`;
  return (
    <div className={`flex justify-between gap-2 ${below ? 'items-start' : 'items-center'}`}>
      <div className="flex-1 min-w-0">
        {onClick ? (
          <button type="button" onClick={onClick} className={`${labelCls} hover:text-[var(--accent)]`}>
            {label}
          </button>
        ) : (
          <span className={labelCls}>{label}</span>
        )}
        {below}
      </div>
      {headway != null && <HeadwayBadge headway={headway} live={live} suffix={headwaySuffix} />}
    </div>
  );
}

/** Muted destination / sub-line in stop card groups. */
export function CardSublineButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left ${CARD_SUBLINE} py-0.5 rounded-lg -mx-1 px-1 ${className}`}
    >
      {children}
    </button>
  );
}
