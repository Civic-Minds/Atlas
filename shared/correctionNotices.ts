export type CorrectionNoticeType =
  | 'excludedNonRevenueTrips'
  | 'removedPlaceholderDestination';

export interface CorrectionNotice {
  type: CorrectionNoticeType;
  routeShortNames?: string[];
  routeIds?: string[];
}

/**
 * Atlas's own notes about fixes it made to an agency's data (not the agency's notices). A route they apply to shows the
 * corrected-data line (N5), and its Learn more (E3) opens with this note. Ryan approved the words, CIV-1639 (2026-11-15).
 */
const CORRECTION_NOTICE_COPY: Record<CorrectionNoticeType, string> = {
  excludedNonRevenueTrips: 'We removed trips marked “Not in Service” because they don’t take passengers.',
  removedPlaceholderDestination: 'We removed a placeholder destination because it isn’t a real stop.',
};

export function correctionNoticeText(type: CorrectionNoticeType): string {
  return CORRECTION_NOTICE_COPY[type];
}

export function correctionNoticeApplies(
  notice: CorrectionNotice,
  routeShortName: string | null | undefined,
  routeId: string | null | undefined,
): boolean {
  const hasRouteSelector = Boolean(notice.routeShortNames?.length || notice.routeIds?.length);
  if (!hasRouteSelector) return true;

  return Boolean(
    (routeShortName && notice.routeShortNames?.includes(routeShortName))
      || (routeId && notice.routeIds?.includes(routeId)),
  );
}

/** The note for a route, from the first correction that applies to it by short name or by any of its route ids. */
export function correctionNoteForRoute(
  notices: readonly CorrectionNotice[] | null | undefined,
  routeShortName: string | null | undefined,
  routeIds: readonly (string | null | undefined)[],
): string | undefined {
  const notice = (notices ?? []).find(n => correctionNoticeApplies(n, routeShortName, null) || routeIds.some(id => correctionNoticeApplies(n, null, id)));
  return notice ? correctionNoticeText(notice.type) : undefined;
}
