import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { partPeriodText, routeListDisplay } from '../../../utils/effectiveHeadway';
import StopRouteGroup from '../panels/StopRouteGroup';
import { hasRegularServiceInPeriod } from '../../../utils/stretchCard';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';
import { routeLabels } from '../../../utils/format';

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
    expect(screen.getByText('every 8 min')).toBeTruthy();
    expect(screen.getAllByText(LONG).length).toBe(1);
    // City College's own pattern number (40) is not its direction value and stays hidden.
    expect(screen.queryByText(/every 40 min/)).toBeNull();
  });

  it('a direction without pipeline fields stays hidden when the route has no regular service, as on main', () => {
    const bare = { routeId: '8', routeShortName: '8', routeType: 3, day: 'Weekday', tier: '10', serviceClass: 'regular', directionId: 1,
      headsign: "Fisherman's Wharf", headway: 12, headwayByPeriod: { pmPeak: 12 }, headwayByPeriodSustained: { pmPeak: true } } as unknown as ShapeProperties;
    renderRows([cityCollege, bare], 'pmPeak', 'sfmta');
    expect(screen.queryByText('every 12 min')).toBeNull();
    expect(screen.getAllByText(LONG).length).toBe(2);
  });

  it('keeps every row hidden on data without the one-gap flag (before the rebuild), as main does', () => {
    const strip = (f: ShapeProperties) => { const { stretchPeriodOneGap: _, ...rest } = f as any; return rest as ShapeProperties; };
    renderRows([strip(cityCollege), strip(wharf)], 'pmPeak', 'sfmta');
    expect(screen.queryByText('every 8 min')).toBeNull();
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
  it('TTC 10 midday: no row or list says every 315', () => {
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
    // The row's own steady value (30) differs from the route and direction value (315).
    const steady = { ...vicPark, headwayByPeriod: { midday: 30 }, headwayByPeriodSustained: { midday: true } } as unknown as ShapeProperties;
    renderRows([steady], 'midday');
    expect(screen.getByText(/every 30 min/)).toBeTruthy();
    expect(screen.queryByText(/315/)).toBeNull();
    expect(screen.queryByText(LONG)).toBeNull();
    expect(hasRegularServiceInPeriod(steady, 'midday')).toBe(true);
  });

  it('a one-gap period shows no regular service, never the #934 gap or edge wording', () => {
    const both = { ...vicPark, stretchPeriodGap: { midday: { every: 30, gap: 315 } }, stretchPeriodEdge: { midday: { from: 862, every: 30 } } } as unknown as ShapeProperties;
    renderRows([both], 'midday');
    expect(screen.getByText(LONG)).toBeTruthy();
    expect(screen.queryByText(/gap|from /)).toBeNull();
  });

  it('keeps a slow cadence the pipeline does not flag (MBTA 18 AM every 84)', () => {
    const mbta18 = { ...vicPark, routeId: '18', routeShortName: '18', headsign: 'Ashmont', headway: 84, headwayByPeriod: { midday: null },
      routeFilterHeadwayByPeriod: { midday: 84 }, directionFilterHeadwayByPeriod: { midday: 84 }, stretchPeriodHeadway: { midday: 84 },
      periodCoverageHeadway: { midday: 84 }, stretchPeriodOneGap: { midday: false } } as unknown as ShapeProperties;
    renderRows([mbta18], 'midday');
    expect(screen.queryByText(LONG)).toBeNull();
    expect(screen.getByText(/every \d+ min/)).toBeTruthy();
    expect(routeListDisplay([mbta18], 'midday').headway).toBe(84);
  });
});

// #934 (wording approved by Ryan, CIV-271): a late start, an early end or one gap inside steady service.
describe('route card rows word part-period and one-gap service (#934)', () => {
  const bx = {
    routeId: '8BX', routeShortName: '8BX', routeType: 3, day: 'Weekday', stretchRole: 'main', stretchIndex: 0, tier: '10', serviceClass: 'regular',
    routeFilterHeadwayByPeriod: { amPeak: 77 }, routeRunsByPeriod: { amPeak: true }, stretchPeriodOneGap: { amPeak: false },
    headwayByPeriod: { amPeak: 9 }, headwayByPeriodSustained: { amPeak: false }, periodCoverageHeadway: { amPeak: 77 },
    stretchPeriodHeadway: { amPeak: 77 }, stretchPeriodSustained: { amPeak: false }, stretchPeriodRange: { amPeak: null },
  };
  it('a late start reads "from 7:17am, every 9 min" on the row, not every 77', () => {
    const row = { ...bx, directionId: 0, headsign: 'Fisherman\'s Wharf', headway: 9, directionFilterHeadwayByPeriod: { amPeak: 77 },
      stretchPeriodEdge: { amPeak: { from: 437, every: 9 } } } as unknown as ShapeProperties;
    renderRows([row], 'amPeak' as any, 'sfmta');
    expect(screen.getByText(/from 7:17am, every 9 min/)).toBeTruthy();
    expect(screen.queryByText(/every 77/)).toBeNull();
  });
  it('a part-period row reads "until 9:37am, every 12 min" instead of limited', () => {
    const row = { ...bx, directionId: 1, headsign: 'Downtown', headway: null, headwayByPeriod: { midday: null },
      periodCoverageHeadway: { midday: 323 }, maxGapByPeriod: { midday: 323 }, headwayByPeriodSustained: {},
      routeFilterHeadwayByPeriod: { midday: 30 }, routeRunsByPeriod: { midday: true }, directionFilterHeadwayByPeriod: { midday: null },
      stretchPeriodOneGap: { midday: false }, stretchPeriodEdge: { midday: { until: 577, every: 12 } } } as unknown as ShapeProperties;
    // The other direction runs all midday every 30 (CTA 134: inbound only in the morning).
    const other = { ...bx, directionId: 0, headsign: 'North', headway: 30, headwayByPeriod: { midday: 30 }, headwayByPeriodSustained: { midday: true },
      routeFilterHeadwayByPeriod: { midday: 30 }, routeRunsByPeriod: { midday: true }, directionFilterHeadwayByPeriod: { midday: 30 },
      stretchPeriodOneGap: { midday: false } } as unknown as ShapeProperties;
    renderRows([other, row], 'midday', 'cta');
    expect(screen.getByText(/until 9:37am, every 12 min/)).toBeTruthy();
    expect(partPeriodText(row, 'midday')).toBe('until 9:37am, every 12 min');
  });
  it('one gap inside steady service reads "every 10 min, with a 45 min gap"', () => {
    const row = { ...bx, directionId: 0, headsign: 'North', headway: 10, headwayByPeriod: { midday: 10 },
      routeFilterHeadwayByPeriod: { midday: 45 }, routeRunsByPeriod: { midday: true }, directionFilterHeadwayByPeriod: { midday: 45 },
      stretchPeriodOneGap: { midday: false }, stretchPeriodGap: { midday: { every: 10, gap: 45 } } } as unknown as ShapeProperties;
    renderRows([row], 'midday', 'ttc');
    expect(screen.getByText(/every 10 min, with a 45 min gap/)).toBeTruthy();
  });
  it('the stop card shows the same part-period words (route card and stop card agree)', () => {
    render(<StopRouteGroup shortName="134" label={routeLabels({ shortName: '134', longName: 'Stony Island' })} longName="Stony Island" agencyName="CTA" branches={[
      { rKey: 'cta::134', headsign: 'Downtown', directionId: 1, service: { value: 12 } as any, periodText: 'until 9:37am, every 12 min' },
    ]} period="midday" showAgency={false} onOpenRoute={() => {}} />);
    expect(screen.getByText('until 9:37am, every 12 min')).toBeTruthy();
    expect(screen.queryByText('every 12 min')).toBeNull();
  });
});
