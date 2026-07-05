import React, { useState } from 'react';
import type { ShapeProperties, TimePeriod } from '../../../hooks/useIntervalStats';
import { PERIOD_LABELS } from '../../../hooks/useIntervalStats';
import type { HeadwayByPeriod } from '../../../hooks/useAgencyData';
import type { Agency } from '../../../App';
import { titleCase, cleanHeadsign, shortenAgencyName } from '../../../utils/format';
import { HeadwaySparkline } from '../HeadwaySparkline';
import RouteCardTitle from '../../RouteCardTitle';
import RouteDirectionRow from '../RouteDirectionRow';
import { TIME_PERIODS } from '../../../../shared/config';

// Derive a period headway from headwayByHour when headwayByPeriod doesn't have it yet.
// Takes the best (lowest) non-null headway across the period's hours.
function periodHeadwayFromByHour(
  byHour: Record<number, number | null> | undefined,
  periodKey: string,
): number | null {
  if (!byHour) return null;
  const p = TIME_PERIODS.find(t => t.key === periodKey);
  if (!p) return null;
  let best: number | null = null;
  for (let h = p.startHour; h < p.endHour; h++) {
    const v = byHour[h];
    if (v != null && (best === null || v < best)) best = v;
  }
  return best;
}

export interface DirectionGroup {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
}

export interface CurrentRouteData {
  routeShortName: string | null;
  routeLongName: string | null;
  directions: ShapeProperties[];
}

export interface RouteCardHeadwayProps {
  currentRoute: CurrentRouteData;
  liveRouteInfo: object | null;
  liveStatus: string;
  routeSlug: string | undefined;
  routeAgency: Agency | undefined;
  setSelectedAgencySlug: ((slug: string | null) => void) | undefined;
  setSelectedRoute: (r: string | null) => void;
  maxHeadway: number;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  directionGroups: DirectionGroup[];
  hideSpan: boolean;
  routeIsStale: boolean;
  expDateStr: string;
}

export const RouteCardHeadway: React.FC<RouteCardHeadwayProps> = ({
  currentRoute,
  liveRouteInfo,
  liveStatus,
  routeSlug,
  routeAgency,
  setSelectedAgencySlug,
  setSelectedRoute,
  maxHeadway,
  period,
  setPeriod,
  directionGroups,
  hideSpan,
  routeIsStale,
  expDateStr,
}) => {
  const agencyDisplayName = shortenAgencyName(routeAgency?.name ?? routeSlug ?? '');
  const [hoveredSparklinePeriod, setHoveredSparklinePeriod] = useState<string | null>(null);

  return (
    <>
      {liveRouteInfo && liveStatus !== 'noData' && (
        <div className="flex items-center gap-1.5 -mt-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)] shrink-0" />
          <span className="text-[10px] font-black text-[var(--text-dim)]">Scheduled</span>
        </div>
      )}
      <div className="mb-1">
        <div>
          <RouteCardTitle
            routeShortName={currentRoute.routeShortName}
            routeLongName={currentRoute.routeLongName}
            agencyName={agencyDisplayName}
            onAgencyClick={routeSlug && setSelectedAgencySlug ? () => { setSelectedAgencySlug(routeSlug); setSelectedRoute(null); } : undefined}
          />
          {routeAgency?.excludeRouteShortNames?.length ? (
            <a
              href={routeAgency.issueUrl ?? `https://github.com/Civic-Minds/Atlas/issues?q=is%3Aissue+${routeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-0.5 block"
            >
              We corrected this data
            </a>
          ) : null}
        </div>
      </div>
      {(() => {
        const HOURS = Array.from({ length: 22 }, (_, i) => i + 5);
        const merged: Record<number, number | null> = {};
        for (const h of HOURS) merged[h] = null;
        for (const d of currentRoute.directions) {
          const bh = (d as any).headwayByHour as Record<number, number | null> | undefined;
          if (!bh) continue;
          for (const h of HOURS) {
            const v = bh[h];
            if (v != null && (merged[h] == null || v < merged[h]!)) merged[h] = v;
          }
        }
        const hasAny = HOURS.some(h => merged[h] != null);
        if (!hasAny) return null;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1"><HeadwaySparkline byHour={merged} period={period} onPeriodChange={p => setPeriod(p as TimePeriod)} onPeriodHover={setHoveredSparklinePeriod} /></div>
            <div className="w-[70px] shrink-0 text-right mb-4">
              {(hoveredSparklinePeriod || period !== 'all') && (
                <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[(hoveredSparklinePeriod ?? period) as TimePeriod]}</span>
              )}
            </div>
          </div>
        );
      })()}
      <div className="space-y-3">
        {(() => {
          const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
          const groupHeadway = (g: DirectionGroup) => g.realTier[0]?.headway ?? null;
          const collapseGroups = allLackHeadsigns && directionGroups.length > 1 &&
            directionGroups.every(g => groupHeadway(g) === groupHeadway(directionGroups[0]));
          const displayGroups = collapseGroups ? [directionGroups[0]] : directionGroups;
          const needsNumbered = allLackHeadsigns && !collapseGroups && directionGroups.length > 1;
          return displayGroups.map((group, gi) => {
            const fmtH = (d: ShapeProperties): string => {
              const cleaned = cleanHeadsign((d.headsign ?? '').trim(), currentRoute.routeShortName, currentRoute.routeLongName);
              if (!cleaned) return '';
              const h = titleCase(cleaned);
              return /^to\s/i.test(h) || / to /i.test(h) ? h : `to ${h}`;
            };
            const spanNames = group.span
              .map(d => d.headsign ? titleCase(cleanHeadsign(d.headsign.trim(), currentRoute.routeShortName, currentRoute.routeLongName)) : '')
              .filter(Boolean);
            return (
              <React.Fragment key={group.dirId}>
                {gi > 0 && displayGroups.length > 1 && displayGroups.length > 2 && (
                  <div className="border-t border-[var(--border-primary)] opacity-30" />
                )}
                <div className="space-y-2">
                  {group.realTier.map((d, i) => {
                    const minStopHw = (d as any).minStopHeadway as number | undefined;
                    const dimmed = maxHeadway !== Infinity && (minStopHw ?? d.headway ?? Infinity) > maxHeadway;
                    return (() => {
                      const label = d.headsign ? fmtH(d) : needsNumbered ? `Direction ${gi + 1}` : '';
                      if (!label && !collapseGroups) return null;
                      const byPeriod = d.headwayByPeriod as HeadwayByPeriod | undefined;
                      const byHour = (d as any).headwayByHour as Record<number, number | null> | undefined;
                      const ph = period !== 'all'
                        ? (byPeriod?.[period as keyof HeadwayByPeriod] ?? periodHeadwayFromByHour(byHour, period))
                        : undefined;
                      const displayH = ph ?? d.headway;
                      const trunkHw = period !== 'all'
                        ? ((d as any).minStopHeadwayByPeriod as Partial<Record<string, number>> | undefined)?.[period]
                        : undefined;
                      return (
                        <RouteDirectionRow
                          key={`r${i}`}
                          label={label}
                          headway={displayH ?? undefined}
                          trunkHeadway={trunkHw}
                          dimmed={dimmed}
                        />
                      );
                    })();
                  })}
                  {(!hideSpan || group.realTier.length === 0) && group.span.length === 1 && (
                    <RouteDirectionRow key="s0" label={group.span[0].headsign ? fmtH(group.span[0]) : 'limited service'} limited />
                  )}
                  {(!hideSpan || group.realTier.length === 0) && group.span.length > 1 && (
                    <RouteDirectionRow key="smulti" label={spanNames.join(' · ')} limited />
                  )}
                  {hideSpan && group.realTier.length > 0 && spanNames.length > 0 && (
                    <RouteDirectionRow key="span-hint" label={spanNames.join(' · ')} limitedHint />
                  )}
                </div>
              </React.Fragment>
            );
          });
        })()}
        {routeIsStale && (
          <div className="mt-2 border-t border-[var(--border-primary)] pt-2 opacity-80">
            <p className="text-[9px] font-bold text-[var(--text-dim)]">
              Schedule may be outdated{expDateStr ? ` (ended ${expDateStr})` : ''}{routeSlug && (
                <>{' '}<a
                  href="https://github.com/Civic-Minds/Atlas/blob/main/docs/SCHEDULES.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-bold"
                >Learn more →</a></>
              )}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
