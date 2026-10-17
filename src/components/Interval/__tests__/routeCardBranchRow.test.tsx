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

describe('route card rows when the route has no regular service (#954)', () => {
  it("shows a row's own direction value; a row without one still reads no regular service", () => {
    renderCard('pmPeak');
    expect(screen.getByText('about every 8 min')).toBeTruthy();
    expect(screen.getAllByText('no regular service').length).toBeGreaterThan(0);
    // City College's own pattern number (40) is not its direction value and stays hidden.
    expect(screen.queryByText(/every 40 min/)).toBeNull();
  });
});
