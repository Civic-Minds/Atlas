import { forwardRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

// The issue report's details, shown in place of the report button so the test can read them.
vi.mock('../cardUi', async importOriginal => ({
  ...(await importOriginal<typeof import('../cardUi')>()),
  CardReportButton: forwardRef<unknown, { details: string }>(({ details }, _ref) => <pre data-testid="report">{details}</pre>),
}));

const route = {
  routeId: '301', routeShortName: '301', routeType: 0, day: 'Weekday', tier: '30', headway: 30, serviceClass: 'regular', directionId: 0, headsign: 'Long Branch',
  headwayByPeriod: { midday: 30, late: 30, overnight: 30 }, headwayByPeriodSustained: { late: true, overnight: true }, nightService30: true, nightService60: true,
} as unknown as ShapeProperties;

const report = (nightView: boolean, period: 'midday' | 'all') => {
  render(
    <RouteCardHeadway
      currentRoute={{ routeShortName: '301', routeLongName: 'Queen', directions: [route] }}
      routeSlug="ttc" routeAgency={undefined} setSelectedAgencySlug={undefined} setSelectedRoute={() => {}}
      maxHeadway={Infinity} period={period} setPeriod={() => {}}
      directionGroups={[{ dirId: 0, realTier: [route], span: [] }]}
      hideSpan={false} routeIsStale={false} selectedRouteOutOfFilter={false} hideFilterNotices={nightView} nightView={nightView}
      expDateStr="" hoveredBranch={null} setHoveredBranch={() => {}}
    />,
  );
  return screen.getByTestId('report').textContent ?? '';
};

describe("the route card's issue report names the view it came from", () => {
  it('the Night view: Period is the Night view\'s own label, "Overnight service"', () => {
    expect(report(true, 'all')).toContain('**Period:** Overnight service');
  });
  it('a time period: its name and hours', () => {
    expect(report(false, 'midday')).toMatch(/\*\*Period:\*\* Midday \(/);
  });
});
