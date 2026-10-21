import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import type { HoveredBranch } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

// CIV-512, shaped like MARTA 20: one direction runs every 15 all day; the other has a main
// branch every 30 and a part-day ("infrequent") branch every 30 at midday only.
const base = { routeId: '20', routeShortName: '20', routeType: 3, day: 'Weekday', serviceClass: 'regular', stretchRole: 'main', stretchIndex: 0 };
const west = { ...base, directionId: 1, headsign: 'Five Points', tier: '15', headway: 15, headwayByHour: { 7: 15, 8: 15, 12: 15, 13: 15 }, headwayByPeriod: { amPeak: 15, midday: 15 } } as unknown as ShapeProperties;
const main = { ...base, directionId: 0, headsign: 'Snapfinger', tier: '30', headway: 30, headwayByHour: { 7: 30, 8: 30, 12: 30, 13: 30 }, headwayByPeriod: { amPeak: 30, midday: 30 } } as unknown as ShapeProperties;
const partDay = { ...base, directionId: 0, headsign: 'S DeKalb', tier: 'infrequent', headway: 30, headwayByHour: { 12: 30, 13: 30 }, headwayByPeriod: { midday: 30 } } as unknown as ShapeProperties;

const renderCard = (hoveredBranch: HoveredBranch | null) => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: '20', routeLongName: null, directions: [west, main, partDay] }}
    routeSlug="marta"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period="all"
    setPeriod={() => {}}
    directionGroups={[{ dirId: 1, realTier: [west], span: [] }, { dirId: 0, realTier: [main, partDay], span: [] }]}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    expDateStr=""
    hoveredBranch={hoveredBranch}
    setHoveredBranch={() => {}}
  />,
);

/** Per chart hour: the drawn bar's total height in px (0 when no bar), and its segments. */
const bars = (container: HTMLElement) => [...container.querySelectorAll('.relative.z-10.flex > div > div')].map(column => {
  const bar = [...column.children].find(el => !(el as HTMLElement).dataset.testid) as HTMLElement | undefined;
  const segments = bar ? [...bar.children] as HTMLElement[] : [];
  const height = !bar ? 0 : segments.length ? segments.reduce((sum, s) => sum + parseFloat(s.style.height), 0) : parseFloat(bar.style.height);
  return { height, segments };
});

describe('route card hour chart: one fixed scale, a selected branch shows its share (CIV-512)', () => {
  it('keeps the same y axis when a branch is selected, and shows that direction\'s trips split by branch', () => {
    const plain = renderCard(null);
    const before = bars(plain.container);
    plain.unmount();
    const picked = renderCard({ directionId: 0, headsign: 'S DeKalb' });
    const after = bars(picked.container);
    const i7 = 1, i12 = 6; // chart hours start at 6 a.m.
    // The axis top is the route's busiest hour (every 15, the other direction), not the shown
    // series' own: with nothing selected the every-30 bars are half height, not full.
    expect(before[i7].height).toBe(16);
    // Selecting the part-day branch keeps that axis: at noon both branches run, every 15 together,
    // drawn at full height; at 7 a.m. only the main branch runs (every 30), still half height.
    expect(after[i12].height).toBe(32);
    expect(after[i7].height).toBe(16);
    // The part-day branch is a segment: the selected one in full colour, the other faded.
    expect(after[i12].segments).toHaveLength(2);
    expect(after[i12].segments.map(s => s.className.includes('opacity-40'))).toEqual([true, false]);
  });
});

describe('route card hour chart: a one-branch row leaves the chart as it is (CIV-512)', () => {
  it('hovering the only branch of a direction redraws nothing', () => {
    const plain = renderCard(null);
    const before = bars(plain.container).map(b => [b.height, b.segments.length]);
    plain.unmount();
    const hovered = renderCard({ directionId: 1, headsign: 'Five Points' });
    expect(bars(hovered.container).map(b => [b.height, b.segments.length])).toEqual(before);
  });
});

// #1064, shaped like TTC 51 Southbound: two rows share the headsign and differ only by pattern
// (one per origin), so hovering one must not highlight the other.
describe('route card hover: two rows with one headsign (#1064)', () => {
  const sb = { ...base, routeId: '51', routeShortName: '51', directionId: 0, headsign: 'Donlands via Laird', tier: '15', headway: 15,
    headwayByHour: { 17: 15 }, headwayByPeriod: { pmPeak: 15 } };
  const fromLeslie = { ...sb, routeVariant: '51A' } as unknown as ShapeProperties;
  const fromDonway = { ...sb, routeVariant: '51B' } as unknown as ShapeProperties;
  const renderRows = (hoveredBranch: HoveredBranch | null, setHoveredBranch: (b: HoveredBranch | null) => void = () => {}) => render(
    <RouteCardHeadway
      currentRoute={{ routeShortName: '51', routeLongName: null, directions: [fromLeslie, fromDonway] }}
      routeSlug="ttc"
      routeAgency={undefined}
      setSelectedAgencySlug={undefined}
      setSelectedRoute={() => {}}
      maxHeadway={Infinity}
      period="all"
      setPeriod={() => {}}
      directionGroups={[{ dirId: 0, realTier: [fromLeslie, fromDonway], span: [] }]}
      hideSpan={false}
      routeIsStale={false}
      selectedRouteOutOfFilter={false}
      expDateStr=""
      hoveredBranch={hoveredBranch}
      setHoveredBranch={setHoveredBranch}
    />,
  );
  const highlighted = (c: HTMLElement) => c.querySelectorAll('[class*="bg-[var(--bg-hover)]"]').length;

  it('hovering a row records its pattern, and only that row is highlighted', () => {
    const seen: (HoveredBranch | null)[] = [];
    const { container, unmount } = renderRows(null, b => seen.push(b));
    const rows = [...container.querySelectorAll<HTMLElement>('[class*="cursor-pointer"]')];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // The two branch rows are the last two hoverable elements (the chart comes first).
    fireEvent.mouseEnter(rows.at(-2)!);
    expect(seen.at(-1)).toMatchObject({ directionId: 0, headsign: 'Donlands via Laird', routeVariant: '51A' });
    fireEvent.mouseEnter(rows.at(-1)!);
    expect(seen.at(-1)).toMatchObject({ directionId: 0, headsign: 'Donlands via Laird', routeVariant: '51B' });
    unmount();
    const one = renderRows({ directionId: 0, headsign: 'Donlands via Laird', routeVariant: '51B' });
    expect(highlighted(one.container)).toBe(1);
  });
});
