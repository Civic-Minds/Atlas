export type CorrectionNoticeType =
  | 'excludedNonRevenueTrips'
  | 'removedPlaceholderDestination';

export interface CorrectionNotice {
  type: CorrectionNoticeType;
  routeShortNames?: string[];
  routeIds?: string[];
}

const CORRECTION_NOTICE_COPY: Record<CorrectionNoticeType, string> = {
  excludedNonRevenueTrips:
    'We excluded trips marked “Not in Service” from the rider schedule because they are not available to passengers.',
  removedPlaceholderDestination:
    'We removed a placeholder destination because it is not a real stop.',
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
