import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarControls } from '../SidebarControls';
import { ColorVisionProvider, useColorVision } from '../../../context/ColorVisionContext';
import { getTierColor } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';

const noop = () => {};

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Route 42 serves stop S1 at midday but not overnight; route 99 is a second choice for the "which route?" list. */
const layers: Record<string, GeoJSON.FeatureCollection> = {
  ttc: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-79.4, 43.65], [-79.39, 43.66]] },
        properties: {
          routeId: 'R1',
          routeShortName: '42',
          routeLongName: 'Cummer',
          agencyName: 'TTC',
          headsign: 'East',
          directionId: 0,
          day: 'Weekday',
          tier: '10',
          headway: 10,
          stopHeadways: { S1: 10 },
          stopPeriodHeadways: { S1: { midday: 10, overnight: null } },
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-79.41, 43.65], [-79.42, 43.66]] },
        properties: {
          routeId: 'R2',
          routeShortName: '99',
          routeLongName: 'Arrow Rd',
          agencyName: 'TTC',
          headsign: 'West',
          directionId: 0,
          day: 'Weekday',
          tier: '10',
          headway: 10,
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-79.4, 43.65] },
        properties: { stopId: 'S1', stopName: 'Main St', routeIds: ['R1'] },
      },
    ],
  },
};

function renderSidebar(overrides: { period?: TimePeriod; selectedStop?: string | null; disambiguationRoutes?: string[] | null } = {}) {
  return (
    <SidebarControls
      query=""
      setQuery={noop}
      searchFocused={false}
      searchMatches={null}
      searchMatchResults={null}
      searchStopMatchResults={null}
      maxHeadway={Infinity}
      agencies={[]}
      period={overrides.period ?? 'midday'}
      setPeriod={noop}
      selectedStop={overrides.selectedStop ?? null}
      setSelectedStop={noop}
      selectedRoute={null}
      setSelectedRoute={noop}
      disambiguationRoutes={overrides.disambiguationRoutes ?? null}
      setDisambiguationRoutes={noop}
      layers={layers}
      currentDay="Weekday"
      hideSpan={false}
      hoveredBranch={null}
      setHoveredBranch={noop}
    />
  );
}

describe('SidebarControls memo dependencies', () => {
  it('refreshes the stop card route list when the time changes', () => {
    const { rerender } = render(renderSidebar({ selectedStop: 'ttc::S1', period: 'midday' }));
    expect(screen.queryAllByText(/42/).length).toBeGreaterThan(0);

    rerender(renderSidebar({ selectedStop: 'ttc::S1', period: 'overnight' }));
    expect(screen.queryAllByText(/42/)).toHaveLength(0);
  });

  it('recolours the "which route?" list when colour-vision mode changes', () => {
    // Stable array, as in the app, so only the colour mode changes between renders.
    const choices = ['ttc::R1', 'ttc::R2'];
    let setFriendly: (v: boolean) => void = noop;
    function Harness() {
      setFriendly = useColorVision().setColorVisionFriendly;
      return renderSidebar({ disambiguationRoutes: choices });
    }
    const { container } = render(<ColorVisionProvider><Harness /></ColorVisionProvider>);
    const dotColors = () => Array.from(container.querySelectorAll<HTMLElement>('span.rounded-full')).map(d => d.style.background);
    const toCss = (hex: string) => {
      const probe = document.createElement('span');
      probe.style.background = hex;
      return probe.style.background;
    };
    const defaultColor = toCss(getTierColor('10', 'default'));
    const friendlyColor = toCss(getTierColor('10', 'friendly'));
    expect(defaultColor).not.toBe(friendlyColor);
    expect(dotColors()).toEqual([defaultColor, defaultColor]);

    act(() => setFriendly(true));
    expect(dotColors()).toEqual([friendlyColor, friendlyColor]);
  });
});
