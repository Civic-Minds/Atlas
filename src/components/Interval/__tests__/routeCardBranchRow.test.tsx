import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

// #954: SF Muni 8, weekday PM peak. The route value is empty (City College has no regular
// service), and the card read every row as "no regular service", including the Fisherman's
// Wharf row that runs every 8.
const routeFields = {
  routeId: '8', routeShortName: '8', routeLongName: 'Bayshore', routeType: 3, day: 'Weekday', tier: '10', serviceClass: 'regular',
  routeFilterHeadwayByPeriod: { pmPeak: null, midday: 10 },
  routeRunsByPeriod: { pmPeak: true, midday: true },
};
const wharf = {
  ...routeFields, directionId: 1, headsign: "Fisherman's Wharf", headway: 8,
  headwayByPeriod: { pmPeak: 8, midday: 10 },
  directionFilterHeadwayByPeriod: { pmPeak: 8, midday: 10 },
} as unknown as ShapeProperties;
const cityCollege = {
  ...routeFields, directionId: 0, headsign: 'City College', headway: 10,
  headwayByPeriod: { pmPeak: 40, midday: 10 },
  directionFilterHeadwayByPeriod: { pmPeak: null, midday: 10 },
} as unknown as ShapeProperties;

const renderCard = (period: 'pmPeak' | 'all') => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: '8', routeLongName: 'Bayshore', directions: [cityCollege, wharf] }}
    routeSlug="sfmta"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period={period}
    setPeriod={() => {}}
    directionGroups={[{ dirId: 0, realTier: [cityCollege], span: [] }, { dirId: 1, realTier: [wharf], span: [] }]}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    expDateStr=""
    hoveredBranch={null}
    setHoveredBranch={() => {}}
  />,
);

const renderRows = (directions: ShapeProperties[], period: 'midday') => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: directions[0].routeShortName ?? null, routeLongName: null, directions }}
    routeSlug="ttc"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period={period}
    setPeriod={() => {}}
    directionGroups={directions.map(d => ({ dirId: d.directionId ?? 0, realTier: [d], span: [] }))}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    expDateStr=""
    hoveredBranch={null}
    setHoveredBranch={() => {}}
  />,
);

describe('a row whose number is one gap between a few departures', () => {
  // TTC 10 weekday midday: Victoria Park 09:07, 14:22, 14:52 showed "every 315"; the route value is 315 too.
  const ttc10 = { routeId: '10', routeShortName: '10', day: 'Weekday', tier: '30', serviceClass: 'regular', routeType: 3,
    routeFilterHeadwayByPeriod: { midday: 315 }, routeRunsByPeriod: { midday: true } };
  it('reads no regular service during this period instead of the gap', () => {
    const vicPark = { ...ttc10, directionId: 0, headsign: 'Victoria Park', headway: 30, headwayByPeriod: { midday: null },
      directionFilterHeadwayByPeriod: { midday: 315 }, stretchPeriodOneGap: { midday: true } } as unknown as ShapeProperties;
    const donMills = { ...ttc10, directionId: 1, headsign: 'Don Mills', headway: 30, headwayByPeriod: { midday: 30 },
      headwayByPeriodSustained: { midday: true }, directionFilterHeadwayByPeriod: { midday: 30 }, stretchPeriodOneGap: { midday: false } } as unknown as ShapeProperties;
    renderRows([vicPark, donMills], 'midday');
    expect(screen.queryByText(/315/)).toBeNull();
    expect(screen.getAllByText('no regular service during this period').length).toBe(1);
    expect(screen.getByText('about every 30 min')).toBeTruthy();
  });
  it('keeps a slow cadence the pipeline does not flag (MBTA 18 AM every 84)', () => {
    const mbta18 = { ...ttc10, routeId: '18', routeShortName: '18', directionId: 0, headsign: 'Ashmont', headway: 84, headwayByPeriod: { midday: null },
      routeFilterHeadwayByPeriod: { midday: 84 }, directionFilterHeadwayByPeriod: { midday: 84 }, stretchPeriodOneGap: { midday: false } } as unknown as ShapeProperties;
    renderRows([mbta18], 'midday');
    expect(screen.queryByText('no regular service during this period')).toBeNull();
  });
});

describe('route card rows when the route has no regular service (#954)', () => {
  it("shows a row's own direction value; a row without one still reads no regular service", () => {
    renderCard('pmPeak');
    expect(screen.getByText('about every 8 min')).toBeTruthy();
    expect(screen.getAllByText('no regular service during this period').length).toBeGreaterThan(0);
    // City College's own pattern number (40) is not its direction value and stays hidden.
    expect(screen.queryByText(/every 40 min/)).toBeNull();
  });
});
