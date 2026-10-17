import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { routeListDisplay } from '../../../utils/effectiveHeadway';
import { hasRegularServiceInPeriod } from '../../../utils/stretchCard';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

const renderRows = (directions: ShapeProperties[], period: 'midday' | 'pmPeak' | 'all', slug = 'ttc') => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: directions[0].routeShortName ?? null, routeLongName: null, directions }}
    routeSlug={slug}
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

const LONG = 'no regular service during this period';

// #954: SF Muni 8, weekday PM peak. The route value is empty (City College has no regular
// service), and the card read every row as "no regular service", including the Fisherman's
// Wharf row that runs every 8.
const muni = {
  routeId: '8', routeShortName: '8', routeType: 3, day: 'Weekday', tier: '10', serviceClass: 'regular', stretchRole: 'main', stretchIndex: 0,
  routeFilterHeadwayByPeriod: { pmPeak: null, midday: 10 },
  routeRunsByPeriod: { pmPeak: true, midday: true },
};
const wharf = {
  ...muni, directionId: 1, headsign: "Fisherman's Wharf", headway: 8,
  headwayByPeriod: { pmPeak: 8, midday: 10 }, headwayByPeriodSustained: { pmPeak: true, midday: true },
  directionFilterHeadwayByPeriod: { pmPeak: 8, midday: 10 }, stretchPeriodOneGap: { pmPeak: false, midday: false },
} as unknown as ShapeProperties;
const cityCollege = {
  ...muni, directionId: 0, headsign: 'City College', headway: 10,
  headwayByPeriod: { pmPeak: 40, midday: 10 }, headwayByPeriodSustained: { pmPeak: false, midday: true },
  directionFilterHeadwayByPeriod: { pmPeak: null, midday: 10 }, stretchPeriodOneGap: { pmPeak: false, midday: false },
} as unknown as ShapeProperties;

describe('route card rows when the route has no regular service (#954)', () => {
  it("shows a row's own direction value; a row without one still reads no regular service", () => {
    renderRows([cityCollege, wharf], 'pmPeak', 'sfmta');
    expect(screen.getByText('about every 8 min')).toBeTruthy();
    expect(screen.getAllByText(LONG).length).toBe(1);
    // City College's own pattern number (40) is not its direction value and stays hidden.
    expect(screen.queryByText(/every 40 min/)).toBeNull();
  });

  it('keeps every row hidden on data without the one-gap flag (before the rebuild), as main does', () => {
    const strip = (f: ShapeProperties) => { const { stretchPeriodOneGap: _, ...rest } = f as any; return rest as ShapeProperties; };
    renderRows([strip(cityCollege), strip(wharf)], 'pmPeak', 'sfmta');
    expect(screen.queryByText('about every 8 min')).toBeNull();
    expect(screen.getAllByText(LONG).length).toBe(2);
    expect(hasRegularServiceInPeriod(strip(wharf), 'pmPeak')).toBe(false);
    expect(hasRegularServiceInPeriod(wharf, 'pmPeak')).toBe(true);
  });
});

// #955: fields as the pipeline writes them for TTC 10 weekday midday (09:07, 14:22, 14:52 to
// Victoria Park): both directions read 315, the one gap, and both are flagged.
const ttc10 = {
  routeId: '10', routeShortName: '10', routeType: 3, day: 'Weekday', stretchRole: 'main', stretchIndex: 0,
  routeFilterHeadwayByPeriod: { midday: 315 }, routeRunsByPeriod: { midday: true },
  headwayByPeriod: { midday: 173 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 315 },
  directionFilterHeadwayByPeriod: { midday: 315 }, stretchPeriodOneGap: { midday: true },
  stretchPeriodHeadway: { midday: 315 }, stretchPeriodSustained: { midday: false }, stretchPeriodRange: { midday: null },
};
const vicPark = { ...ttc10, directionId: 0, headsign: 'Victoria Park', tier: 'infrequent', serviceClass: 'regular', headway: 173 } as unknown as ShapeProperties;
const donMills = { ...ttc10, directionId: 1, headsign: 'Don Mills', tier: '30', serviceClass: 'time-limited', headway: 30 } as unknown as ShapeProperties;

// CTA 1 weekday midday: the route value is empty; Desplaines & Harrison's direction value (326) is one gap.
const cta1 = {
  routeId: '1', routeShortName: '1', routeType: 3, day: 'Weekday', stretchRole: 'main', stretchIndex: 0,
  routeFilterHeadwayByPeriod: { midday: null }, routeRunsByPeriod: { midday: true }, stretchPeriodOneGap: { midday: true },
  stretchPeriodSustained: { midday: false }, stretchPeriodRange: { midday: null },
};
const michigan = { ...cta1, directionId: 0, headsign: 'Michigan & 34th Street', tier: '20', serviceClass: 'time-limited', headway: 13,
  headwayByPeriod: { midday: null }, headwayByPeriodSustained: {}, periodCoverageHeadway: { midday: 330 },
  directionFilterHeadwayByPeriod: { midday: null }, stretchPeriodHeadway: { midday: 340 } } as unknown as ShapeProperties;
const desplaines = { ...cta1, directionId: 1, headsign: 'Desplaines & Harrison Terminal', tier: 'infrequent', serviceClass: 'regular', headway: 173,
  headwayByPeriod: { midday: 11 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 321 },
  directionFilterHeadwayByPeriod: { midday: 326 }, stretchPeriodHeadway: { midday: 326 } } as unknown as ShapeProperties;

describe('a number that is one gap between a few departures (#955)', () => {
  it('TTC 10 midday: no row, list or scheduled line says every 315', () => {
    renderRows([vicPark, donMills], 'midday');
    expect(screen.queryByText(/315/)).toBeNull();
    expect(screen.getAllByText(LONG).length).toBeGreaterThanOrEqual(2);
    expect(routeListDisplay([vicPark, donMills], 'midday')).toMatchObject({ headway: null, limited: false, noRegular: true });
    expect(hasRegularServiceInPeriod(vicPark, 'midday')).toBe(false);
    expect(hasRegularServiceInPeriod(donMills, 'midday')).toBe(false);
  });

  it('CTA 1 midday: the revealed direction value (326) is one gap, so neither row shows a number', () => {
    renderRows([michigan, desplaines], 'midday', 'cta');
    expect(screen.queryByText(/326|340/)).toBeNull();
    expect(screen.getAllByText(LONG).length).toBe(2);
    expect(hasRegularServiceInPeriod(desplaines, 'midday')).toBe(false);
  });

  it('a flagged row with a steady value of its own keeps it, on the route card and the stop card', () => {
    const steady = { ...vicPark, headwayByPeriod: { midday: 70 }, headwayByPeriodSustained: { midday: true },
      routeFilterHeadwayByPeriod: { midday: 70 }, directionFilterHeadwayByPeriod: { midday: 70 } } as unknown as ShapeProperties;
    renderRows([steady], 'midday');
    // Shown in the card's rounded style (70 reads about every 60).
    expect(screen.getByText(/about every \d+ min/)).toBeTruthy();
    expect(screen.queryByText(LONG)).toBeNull();
    expect(hasRegularServiceInPeriod(steady, 'midday')).toBe(true);
  });

  it('keeps a slow cadence the pipeline does not flag (MBTA 18 AM every 84)', () => {
    const mbta18 = { ...vicPark, routeId: '18', routeShortName: '18', headsign: 'Ashmont', headway: 84, headwayByPeriod: { midday: null },
      routeFilterHeadwayByPeriod: { midday: 84 }, directionFilterHeadwayByPeriod: { midday: 84 }, stretchPeriodHeadway: { midday: 84 },
      periodCoverageHeadway: { midday: 84 }, stretchPeriodOneGap: { midday: false } } as unknown as ShapeProperties;
    renderRows([mbta18], 'midday');
    expect(screen.queryByText(LONG)).toBeNull();
    expect(screen.getByText(/about every \d+ min/)).toBeTruthy();
    expect(routeListDisplay([mbta18], 'midday').headway).toBe(84);
  });
});
