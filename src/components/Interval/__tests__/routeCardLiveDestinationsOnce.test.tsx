import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';
import { DIRECTION_UNCLEAR, rowDirectionKey } from '../../../utils/liveGrouping';

// #1877 guard (Ryan, asked four times; first on Burlington 1: "I don't like how the Live vehicles is separate here from the
// regular destinations"): on the Live route card each destination shows once. A row carries its own vehicles; the list
// under the rows (the card's `extra`) names only destinations no row carries.
const base = {
  routeId: '1', routeShortName: '1', routeType: 3, day: 'Weekday', tier: '10', serviceClass: 'regular', stretchRole: 'main', stretchIndex: 0,
  routeFilterHeadwayByPeriod: { midday: 12 }, routeRunsByPeriod: { midday: true }, headway: 12,
  headwayByPeriod: { midday: 12 }, headwayByPeriodSustained: { midday: true }, directionFilterHeadwayByPeriod: { midday: 12 },
  stretchPeriodOneGap: { midday: false },
};
const hamilton = { ...base, directionId: 0, headsign: 'Hamilton' } as unknown as ShapeProperties;
const appleby = { ...base, directionId: 1, headsign: 'Appleby GO' } as unknown as ShapeProperties;
const destinations = [rowDirectionKey('Hamilton', '1')!, rowDirectionKey('Appleby GO', '1')!, DIRECTION_UNCLEAR];

const card = (rowLive: boolean) => render(
  <RouteCardHeadway
    currentRoute={{ routeShortName: '1', routeLongName: null, directions: [hamilton, appleby] }}
    routeSlug="burlington"
    routeAgency={undefined}
    setSelectedAgencySlug={undefined}
    setSelectedRoute={() => {}}
    maxHeadway={Infinity}
    period="midday"
    setPeriod={() => {}}
    directionGroups={[hamilton, appleby].map(d => ({ dirId: d.directionId ?? 0, realTier: [d], span: [] }))}
    hideSpan={false}
    routeIsStale={false}
    selectedRouteOutOfFilter={false}
    expDateStr=""
    hoveredBranch={null}
    setHoveredBranch={() => {}}
    rowLive={rowLive ? f => {
      const key = rowDirectionKey(f.headsign, '1');
      return key ? { key, subLabel: `${key} vehicles 4`, onClick: () => {} } : null;
    } : undefined}
    extra={claimed => <div>{destinations.filter(d => !claimed.has(d)).map(d => <p key={d}>{`${d} · 2 buses`}</p>)}</div>}
  />,
);
const times = (text: string, name: string) => text.split(name).length - 1;

describe('#1877: the Live route card shows each destination once', () => {
  it('a destination on a row is not listed again under the rows', () => {
    const text = card(true).container.textContent ?? '';
    // Each row names its destination in its label; its vehicles sit under it, and the list below names only the rest.
    for (const d of destinations.slice(0, 2)) expect(times(text, `${d} vehicles`)).toBe(1);
    for (const d of destinations.slice(0, 2)) expect(times(text, `${d} · 2 buses`)).toBe(0);
    expect(times(text, `${DIRECTION_UNCLEAR} · 2 buses`)).toBe(1);
  });

  it('fails if the list repeats a row\'s destination (the bug)', () => {
    // Without rowLive no row carries vehicles, so the list names every destination: each shows a second time.
    const text = card(false).container.textContent ?? '';
    for (const d of destinations.slice(0, 2)) expect(times(text, `${d} · 2 buses`)).toBe(1);
  });
});
