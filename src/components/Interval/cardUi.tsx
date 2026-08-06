import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Flag, Radio, X } from 'lucide-react';
import { fmtHeadway } from '../../utils/format';
import { headwayToTierColor } from './HeadwaySparkline';
import { CARD_NOTICE, CARD_NOTICE_ACTION, FLOATING_CARD, PANEL_ENTER_LEFT } from '../../styles';
import { openAtlasIssueReport } from '../../utils/reportIssue';
import { CARD_CLICK_TO_FLAG_ENABLED } from '../../../shared/config';

export { default as CardDirectionRow } from './RouteDirectionRow';

export const CARD_EYEBROW = 'text-xs font-bold text-[var(--text-muted)] leading-tight mb-0.5';
export const CARD_TITLE = 'text-sm font-black text-[var(--text-primary)] leading-tight';
export const CARD_LIST_ROUTE = 'text-[11px] font-bold text-[var(--text-primary)] leading-snug';
export const CARD_SECTION = 'text-[9px] font-black uppercase tracking-wider text-[var(--text-dim)]';

const REPORT_REASONS = [
  'Route or agency is missing',
  'Route or branch is incorrectly combined',
  'Route name, number, destination, or direction is wrong',
  'Frequency is wrong',
  'Schedule, day, or time-period service is wrong',
  'Route line is missing or follows the wrong path',
  'Stop is missing, misplaced, or assigned incorrectly',
  'Filter, search, or route selection is wrong',
  'Live vehicle information is missing or wrong',
  'Route data is stale',
] as const;

const FREQUENCY_REASONS = [
  'Too frequent',
  'Not frequent enough',
  'Assigned to the wrong branch or line',
  'Shown in the wrong time period',
  'Does not match the current schedule',
] as const;

const REPORT_CATEGORIES = [
  {
    key: 'route',
    label: 'Route',
    description: 'Name, branch, line, frequency, or schedule',
    reasons: [
      'Route or agency is missing',
      'Route or branch is incorrectly combined',
      'Route name, number, destination, or direction is wrong',
      'Frequency is wrong',
      'Schedule, day, or time-period service is wrong',
      'Route line is missing or follows the wrong path',
      'Route data is stale',
    ],
  },
  {
    key: 'stop',
    label: 'Stop',
    description: 'Missing, misplaced, or assigned incorrectly',
    reasons: ['Stop is missing, misplaced, or assigned incorrectly'],
  },
  {
    key: 'filter',
    label: 'Map or filter',
    description: 'Search, filter, or route selection',
    reasons: ['Filter, search, or route selection is wrong'],
  },
  {
    key: 'live',
    label: 'Live vehicle',
    description: 'Missing or incorrect live information',
    reasons: ['Live vehicle information is missing or wrong'],
  },
] as const;

type ReportCategoryKey = (typeof REPORT_CATEGORIES)[number]['key'];

export interface CardReportButtonHandle {
  /** Opens the report dialog with the given reason pre-checked (used by FlaggableValue). */
  openWithReason: (reason: string) => void;
}

export const CardReportButton = React.forwardRef<CardReportButtonHandle, { title: string; details: string; showLiveReason?: boolean; excludeReasons?: string[] }>(
  function CardReportButton({ title, details, showLiveReason = false, excludeReasons = [] }, ref) {
  const reportReasons = REPORT_REASONS.filter(reason => {
    if (reason === 'Live vehicle information is missing or wrong') return showLiveReason;
    return !excludeReasons.includes(reason);
  });
  const [isOpen, setIsOpen] = React.useState(false);
  const dialogTitleId = React.useId();
  const [selectedReasons, setSelectedReasons] = React.useState<string[]>([]);
  const [frequencyReasons, setFrequencyReasons] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState('');
  const [validationError, setValidationError] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<ReportCategoryKey | null>(null);
  const reportButtonRef = React.useRef<HTMLButtonElement>(null);
  const [reportCardPosition, setReportCardPosition] = React.useState<{ top: number; left: number } | null>(null);

  const updateReportCardPosition = React.useCallback(() => {
    const button = reportButtonRef.current;
    if (!button || typeof window === 'undefined') return;
    const anchor = button.closest<HTMLElement>('[data-report-anchor]') ?? button;
    const rect = anchor.getBoundingClientRect();
    const cardWidth = 384;
    const edge = 16;
    if (window.innerWidth < 640) {
      setReportCardPosition({ top: Math.max(edge, Math.min(rect.top, window.innerHeight - 120)), left: edge });
      return;
    }
    const rightPosition = rect.right + 12;
    const left = rightPosition + cardWidth <= window.innerWidth - edge
      ? rightPosition
      : Math.max(edge, rect.left - cardWidth - 12);
    setReportCardPosition({ top: Math.max(edge, Math.min(rect.top, window.innerHeight - 120)), left });
  }, []);

  const openReport = () => {
    setIsOpen(true);
    requestAnimationFrame(updateReportCardPosition);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    updateReportCardPosition();
    window.addEventListener('resize', updateReportCardPosition);
    window.addEventListener('scroll', updateReportCardPosition, true);
    return () => {
      window.removeEventListener('resize', updateReportCardPosition);
      window.removeEventListener('scroll', updateReportCardPosition, true);
    };
  }, [isOpen, updateReportCardPosition]);

  React.useImperativeHandle(ref, () => ({
    openWithReason: (reason: string) => {
      const category = REPORT_CATEGORIES.find(item => item.reasons.includes(reason as never));
      setSelectedCategory(category?.key ?? null);
      if (reportReasons.includes(reason as (typeof REPORT_REASONS)[number])) {
        setSelectedReasons(current => current.includes(reason) ? current : [...current, reason]);
      }
      openReport();
    },
  }), [reportReasons]);

  const reset = () => {
    setIsOpen(false);
    setSelectedReasons([]);
    setFrequencyReasons([]);
    setDescription('');
    setValidationError('');
    setReportCardPosition(null);
    setSelectedCategory(null);
  };

  const toggleReason = (reason: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(current => current.includes(reason) ? current.filter(item => item !== reason) : [...current, reason]);
  };

  const hasFrequencyReason = selectedReasons.includes('Frequency is wrong');
  const availableCategories = REPORT_CATEGORIES.filter(category =>
    category.reasons.some(reason => reportReasons.includes(reason as (typeof REPORT_REASONS)[number])),
  );
  const selectedCategoryDetails = selectedCategory
    ? REPORT_CATEGORIES.find(category => category.key === selectedCategory)
    : undefined;
  const selectedCategoryReasons = selectedCategoryDetails?.reasons.filter(reason =>
    reportReasons.includes(reason as (typeof REPORT_REASONS)[number]),
  ) ?? [];
  const copiesDiagnostics = details.includes('Generated route metrics from the loaded artifact:')
    || details.includes('Generated route metrics (loaded artifact):');

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasFrequencyReason && frequencyReasons.length === 0) {
      setValidationError('Select at least one frequency detail.');
      return;
    }
    if (selectedReasons.length === 0 && !description.trim()) {
      setValidationError('Select a reason or describe what is wrong.');
      return;
    }
    openAtlasIssueReport(title, details, {
      reasons: selectedReasons,
      frequencyReasons: hasFrequencyReason ? frequencyReasons : [],
      description,
    });
    reset();
  };

  return (
    <>
      <button
        type="button"
        ref={reportButtonRef}
        onClick={openReport}
        aria-label="Report a problem with this card"
        title="Report a problem with this card"
        className="shrink-0 p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[1600]"
          onMouseDown={event => { if (event.target === event.currentTarget) reset(); }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onSubmit={submit}
            onMouseDown={event => event.stopPropagation()}
            className={`absolute w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto ${FLOATING_CARD}`}
            style={{ top: reportCardPosition?.top ?? 16, left: reportCardPosition?.left ?? 16 }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-primary)]">
              <div>
                <h2 id={dialogTitleId} className="text-sm font-black text-[var(--text-primary)]">Report a problem</h2>
                <p className="text-[10px] font-bold text-[var(--text-dim)] mt-0.5">Select all that apply (optional).</p>
              </div>
              <button type="button" onClick={reset} aria-label="Close report form" className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-dim)] hover:bg-[var(--bg-btn-hover)]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {!selectedCategory ? (
                <fieldset>
                  <legend className="text-[10px] font-black text-[var(--text-muted)] mb-2">I have an issue with a…</legend>
                  <div className="space-y-2">
                    {availableCategories.map(category => (
                      <button
                        key={category.key}
                        type="button"
                        onClick={() => { setValidationError(''); setSelectedCategory(category.key); }}
                        className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-app)] px-3 py-2.5 text-left hover:bg-[var(--bg-btn-hover)] transition-colors"
                      >
                        <span className="block text-[11px] font-black text-[var(--text-primary)]">{category.label}</span>
                        <span className="block mt-0.5 text-[10px] font-bold text-[var(--text-dim)]">{category.description}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <fieldset>
                  <div className="flex items-center justify-between mb-2">
                    <legend className="text-[10px] font-black text-[var(--text-muted)]">What is wrong with this {selectedCategoryDetails?.label.toLowerCase()}?</legend>
                    <button
                      type="button"
                      onClick={() => { setValidationError(''); setSelectedCategory(null); }}
                      className="text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--accent)]"
                    >
                      Change
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {selectedCategoryReasons.map(reason => (
                      <label key={reason} className="flex items-start gap-1.5 px-1.5 py-1 rounded-lg hover:bg-[var(--bg-btn-hover)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedReasons.includes(reason)}
                          onChange={() => {
                            setValidationError('');
                            if (reason === 'Frequency is wrong' && hasFrequencyReason) setFrequencyReasons([]);
                            toggleReason(reason, setSelectedReasons);
                          }}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <span className="text-[11px] font-bold text-[var(--text-primary)] leading-snug">{reason}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {selectedCategory && hasFrequencyReason && (
                <fieldset className="space-y-1.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] p-3">
                  <legend className="px-1 text-[10px] font-black text-[var(--text-muted)]">Frequency details</legend>
                  {FREQUENCY_REASONS.map(reason => (
                    <label key={reason} className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg hover:bg-[var(--bg-btn-hover)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={frequencyReasons.includes(reason)}
                        onChange={() => { setValidationError(''); toggleReason(reason, setFrequencyReasons); }}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span className="text-[11px] font-bold text-[var(--text-primary)] leading-snug">{reason}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              {selectedCategory && <label className="block">
                <span className="text-[10px] font-black text-[var(--text-muted)]">What’s wrong? {selectedReasons.length === 0 && <span className="text-[var(--accent)]">Required</span>}</span>
                <textarea
                  value={description}
                  onChange={event => { setDescription(event.target.value); setValidationError(''); }}
                  rows={4}
                  placeholder="Describe what you saw and what you expected."
                  className="mt-1.5 w-full resize-y rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
                />
              </label>}
              {selectedCategory && copiesDiagnostics && (
                <p className="text-[10px] font-bold text-[var(--text-dim)]">
                  Submitting copies route diagnostics to your clipboard so you can paste them into GitHub.
                </p>
              )}
              {validationError && <p className="text-[10px] font-bold text-red-600" role="alert">{validationError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 pb-4">
              <button type="button" onClick={reset} className="px-3 py-2 rounded-lg text-[11px] font-black text-[var(--text-muted)] hover:bg-[var(--bg-btn-hover)]">Cancel</button>
              {selectedCategory && <button type="submit" className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-[11px] font-black hover:opacity-90">Open GitHub report</button>}
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
});

/**
 * Wraps a card value that can be clicked directly to report a problem with it — no typing
 * required, the reason is pre-checked. Beta-gated (CARD_CLICK_TO_FLAG_ENABLED): new, unproven
 * interaction, renders children unwrapped everywhere else.
 */
export function FlaggableValue({ reason, reportRef, children, className = 'inline-flex items-center gap-1' }: {
  reason: string;
  reportRef: React.RefObject<CardReportButtonHandle | null>;
  children: React.ReactNode;
  /** Full control over layout — replaces the default `inline-flex items-center gap-1`, doesn't merge with it. */
  className?: string;
}) {
  if (!CARD_CLICK_TO_FLAG_ENABLED) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => reportRef.current?.openWithReason(reason)}
      title={`Flag: ${reason}`}
      className={`group/flag rounded hover:bg-[var(--bg-btn-hover)] transition-colors ${className}`}
    >
      {children}
      <Flag className="w-2.5 h-2.5 text-[var(--text-dim)] opacity-0 group-hover/flag:opacity-100 group-hover/flag:text-[var(--accent)] transition-opacity shrink-0" />
    </button>
  );
}

export function CardBackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="p-0.5 -ml-0.5 mt-0.5 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors shrink-0"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
    </button>
  );
}

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

/** Shared inline notice: muted sentence + action link (outdated, corrected, outside filters, …). */
export function CardHelpNotice({
  message,
  onLearnMore,
  actionLabel = 'Learn more →',
}: {
  message: string;
  onLearnMore: () => void;
  actionLabel?: string;
}) {
  return (
    <p className={CARD_NOTICE}>
      {message}{' '}
      <button type="button" onClick={onLearnMore} className={CARD_NOTICE_ACTION}>
        {actionLabel}
      </button>
    </p>
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
