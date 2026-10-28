import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

// CIV-934: the Night view's route card (TTC 301 Queen). No chart and no period; each destination row reads its night grade.
const base = {
  routeId: '301', routeShortName: '301', routeType: 0, day: 'Weekday', tier: '30', headway: 30, serviceClass: 'regular',
  headwayByPeriod: { midday: null, late: 30, overnight: 30 }, headwayByPeriodSustained: { late: true, overnight: true },
};
const longBranch = { ...base, directionId: 0, headsign: 'Long Branch', nightService30: true, nightService60: true } as unknown as ShapeProperties;
const york = { ...base, directionId: 0, headsign: 'York', nightService30: false, nightService60: true, nightServicePartOfRoute: true } as unknown as ShapeProperties;
const daytimeOnly = { ...base, directionId: 1, headsign: 'Neville Park', headway: 10, headwayByPeriod: { midday: 10 } } as unknown as ShapeProperties;

const renderCard = (nightView: boolean, period: 'midday' | 'all' = 'all') => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: '301', routeLongName: 'Queen', directions: [longBranch, york, daytimeOnly] }}
    routeSlug="ttc"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period={period}
    setPeriod={() => {}}
    directionGroups={[{ dirId: 0, realTier: [longBranch, york], span: [] }, { dirId: 1, realTier: [daytimeOnly], span: [] }]}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    hideFilterNotices={nightView}
    nightView={nightView}
    expDateStr=""
    hoveredBranch={null}
    setHoveredBranch={() => {}}
  />,
);

describe('Night route card (CIV-934)', () => {
  it('reads each destination at its night grade, never a daytime value', () => {
    renderCard(true);
    expect(screen.getByText('every 30 min')).toBeTruthy();
    expect(screen.getByText('every 60 min')).toBeTruthy();
    expect(screen.queryByText('every 10 min')).toBeNull();
    expect(screen.getByText('no regular service')).toBeTruthy();
  });

  it('names a row that runs at night on only part of the route, as the Night list does', () => {
    renderCard(true);
    expect(screen.getByText('Overnight service on part of the route')).toBeTruthy();
  });

  it('draws no chart and no period', () => {
    // The chart's hour labels mark it.
    renderCard(true, 'midday');
    expect(screen.queryByText('12 PM')).toBeNull();
    expect(screen.queryByText(/Midday|All day/)).toBeNull();
  });
});
