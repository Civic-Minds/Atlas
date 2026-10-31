import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';
import { buildDirectionGroups } from '../../../utils/routeCardDirectionGroups';

// #1115: TTC 84 weekday direction 1, fields as published (2026-10-26) for the trunk tail and the peak-only
// Pioneer Village tail, plus the periods the pipeline now lists that the branch does not run through (notThrough).
const stops = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const shared = {
  routeId: '84', routeShortName: '84', routeType: 3, day: 'Weekday', directionId: 1, serviceClass: 'regular',
  directionFilterHeadwayByPeriod: { amPeak: 20, midday: 7, pmPeak: 30, evening: 7, late: 10, overnight: null },
  routeFilterHeadwayByPeriod: { amPeak: 20, midday: 7, pmPeak: 30, evening: 7, late: 10, overnight: null },
  routeRunsByPeriod: { amPeak: true, midday: true, pmPeak: true, evening: true, late: true },
  stretchPeriodOneGap: { amPeak: false, midday: false, pmPeak: false, evening: false, late: false, overnight: false },
};
const meta = (notThrough?: string[]) => ({
  main: { stops: 35, refStop: '4596', trips: 173 },
  tails: [
    { refStop: '6091', stops: 5, km: 1.26, trips: 145, ...(notThrough ? { notThrough: [] } : {}) },
    { refStop: '7497', stops: 15, km: 4.09, trips: 22, ...(notThrough ? { notThrough } : {}) },
    { refStop: '5861', stops: 21, km: 6.04, trips: 18, ...(notThrough ? { notThrough } : {}) },
  ],
});
const features = (notThrough?: string[]) => [
  { ...shared, headsign: 'Weston Rd', tier: '20', headway: 7, stretchRole: 'tail', stretchIndex: 0, stopOrder: stops(40),
    headwayByPeriod: { amPeak: 10, midday: 7, pmPeak: 15, evening: 7 }, headwayByPeriodSustained: { amPeak: true, midday: true, pmPeak: true, evening: true },
    maxGapByPeriod: { amPeak: 12, midday: 10, pmPeak: 16, evening: 10 }, stretchMeta: meta(notThrough) },
  { ...shared, headsign: 'Pioneer Village via Oakdale', tier: '30', headway: null, stretchRole: 'tail', stretchIndex: 2, stopOrder: stops(56),
    headwayByPeriod: { amPeak: 20, midday: 21, pmPeak: 30, evening: null }, headwayByPeriodSustained: { amPeak: true, midday: false, pmPeak: true },
    maxGapByPeriod: { amPeak: 24, midday: 313, pmPeak: 30, evening: 21 }, periodCoverageHeadway: { amPeak: 62, midday: 313, pmPeak: 30 },
    stretchMeta: meta(notThrough) },
] as unknown as ShapeProperties[];

const renderCard = (directions: ShapeProperties[], period: 'midday' | 'amPeak') => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: '84', routeLongName: null, directions }}
    routeSlug="ttc"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period={period}
    setPeriod={() => {}}
    directionGroups={buildDirectionGroups({ directions }, period)}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    expDateStr=""
    hoveredBranch={null}
    setHoveredBranch={() => {}}
  />,
);
const LONG = 'Runs irregularly in this period';

describe('a branch that does not run through a period has no row for it (#1115, Ryan 2026-10-26)', () => {
  it('TTC 84 midday: no Pioneer Village row at all (no every 21, no notice line); Weston Rd keeps every 7', () => {
    renderCard(features(['midday', 'evening', 'late', 'overnight']), 'midday');
    expect(screen.queryByText(/Pioneer Village/)).toBeNull();
    expect(screen.queryByText(/every 21 min/)).toBeNull();
    expect(screen.queryByText(LONG)).toBeNull();
    expect(screen.getByText(/every 7 min/)).toBeTruthy();
  });

  it('AM peak, where the branch runs through, keeps its row and its own every 20', () => {
    renderCard(features(['midday', 'evening', 'late', 'overnight']), 'amPeak');
    expect(screen.getByText(/Pioneer Village/)).toBeTruthy();
    expect(screen.getByText(/every 20 min/)).toBeTruthy();
  });

  it('data without the field keeps the row, as before the rebuild, at its full-window wait, 313 shown as is (#1239; the period is not steady, CIV-1074)', () => {
    renderCard(features(), 'midday');
    expect(screen.getAllByText(/every 313 min/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/every 21 min/)).toBeNull();
  });

  it('a branch with no cadence of its own never shows the trunk\'s number', () => {
    // TTC 927-style: an infrequent-tier tail whose own longest wait rules out its median; the direction reads 7.
    const [weston, pioneer] = features([]);
    const noCadence = { ...pioneer, tier: 'infrequent', headwayByPeriodSustained: { midday: false }, headwayByPeriod: { midday: 10 }, maxGapByPeriod: { midday: 300 } } as ShapeProperties;
    renderCard([{ ...weston, directionFilterHeadwayByPeriod: { midday: 30 } } as ShapeProperties, { ...noCadence, directionFilterHeadwayByPeriod: { midday: 30 } } as ShapeProperties], 'midday');
    expect(screen.getAllByText(/every 7 min/).length).toBe(1);
    expect(screen.queryByText(/every 30 min/)).toBeNull();
  });
});
