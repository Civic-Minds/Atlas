import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../../hooks/useIntervalStats';
import { useNearbyRoutes } from '../../../hooks/useNearbyRoutes';
import {
  routeCardDisplayHeadway,
  routeCardDisplayLimited,
  routeListDisplay,
  routeListDisplayHeadway,
} from '../../../utils/effectiveHeadway';
import { AgencyCard, getRoutes } from '../AgencyCard';
import { NearbyRoutesPanel } from '../NearbyRoutesPanel';
import { routeRowRight } from '../SearchSuggestionsPanel';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';

// Frozen from the live winter-park artifact (release-mv0iozy4). TL-42 runs 3 trips a day;
// its all-day value is 233 min on weekdays and a misleading 56 min on weekends (#706, #708).
const tl42Weekday = {
  routeId: 'TL-42', directionId: 0, tier: 'infrequent', serviceClass: 'regular', headway: 233,
  headwayByPeriod: { amPeak: null, midday: 56, pmPeak: null, evening: null, late: null, overnight: null },
  periodCoverageHeadway: { amPeak: null, midday: 144, pmPeak: 188, evening: null, late: null, overnight: null },
  headwayRangeByPeriod: { amPeak: null, midday: { min: 56, max: 56 }, pmPeak: null, evening: null, late: null, overnight: null },
  maxGapByPeriod: { amPeak: null, midday: 143.65, pmPeak: 188, evening: null, late: 180, overnight: 240 },
  headwayByPeriodSustained: { midday: false },
  routeShortName: '', routeLongName: 'Granby-Grand Lake Connector Gold Line', routeType: 3,
  day: 'Weekday', headsign: 'Granby Trails',
} as unknown as ShapeProperties;

const tl42Saturday = {
  ...tl42Weekday,
  headway: 56,
  periodCoverageHeadway: { amPeak: null, midday: 144, pmPeak: 180, evening: null, late: null, overnight: null },
  maxGapByPeriod: { amPeak: null, midday: 143.65, pmPeak: 180, evening: null, late: 180, overnight: 240 },
  day: 'Saturday',
} as unknown as ShapeProperties;

const frequentSaturday = {
  routeId: 'F-1', directionId: 0, tier: '15', serviceClass: 'regular', headway: 12,
  headwayByPeriod: { amPeak: 12, midday: 12, pmPeak: 12, evening: 15, late: null, overnight: null },
  routeShortName: '1', routeLongName: 'Main Street', routeType: 3,
  day: 'Saturday', headsign: 'Downtown',
} as unknown as ShapeProperties;

const infrequentShortTurn = {
  ...tl42Saturday,
  routeId: 'F-1', routeShortName: '1', routeLongName: 'Main Street', headsign: 'Depot',
} as unknown as ShapeProperties;

const SLUG = 'winter-park';
const STOP_COORDS: [number, number] = [-105.93403, 40.08452];

function feature(props: ShapeProperties): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [STOP_COORDS, [-105.96, 40.097]] }, properties: props as any };
}

function layersFor(day: 'Weekday' | 'Saturday'): Record<string, GeoJSON.FeatureCollection> {
  const tl42 = day === 'Weekday' ? tl42Weekday : tl42Saturday;
  const frequent = { ...frequentSaturday, day } as ShapeProperties;
  return {
    [SLUG]: {
      type: 'FeatureCollection',
      features: [
        feature(tl42),
        feature(frequent),
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: STOP_COORDS },
          properties: { stopId: 'TL-176', stopName: '5th & Agate', routeIds: ['TL-42', 'F-1'] },
        },
      ],
    },
  };
}

const agencyFilters = { maxHeadway: Infinity, selectedModes: new Set<number>(), hideSpan: false, hideLimitedService: false };

describe('Infrequent routes show "limited" on All day and in specific periods (#708)', () => {
  describe('shared rule', () => {
    it('drops the all-day number and marks TL-42 limited on weekdays and weekends', () => {
      for (const p of [tl42Weekday, tl42Saturday]) {
        expect(routeCardDisplayHeadway(p, 'all')).toBeNull();
        expect(routeCardDisplayLimited(p, 'all')).toBe(true);
        expect(routeListDisplay([p], 'all')).toEqual({ headway: null, limited: true });
      }
    });

    it('leaves frequent routes on All day unchanged', () => {
      expect(routeCardDisplayHeadway(frequentSaturday, 'all')).toBe(12);
      expect(routeCardDisplayLimited(frequentSaturday, 'all')).toBe(false);
      expect(routeListDisplay([frequentSaturday], 'all')).toEqual({ headway: 12, limited: false });
    });

    it('lets a real cadence win over an infrequent short-turn on the same route', () => {
      expect(routeListDisplay([frequentSaturday, infrequentShortTurn], 'all')).toEqual({ headway: 12, limited: false });
      expect(routeCardDisplayLimited(infrequentShortTurn, 'all')).toBe(true);
    });

    it('applies the same rule in a specific period', () => {
      // Midday: infrequent median 56 with a 144 min longest gap was already limited.
      expect(routeCardDisplayHeadway(tl42Saturday, 'midday')).toBeNull();
      expect(routeCardDisplayLimited(tl42Saturday, 'midday')).toBe(true);
      // AM peak: no service is not limited.
      expect(routeCardDisplayLimited(tl42Saturday, 'amPeak')).toBe(false);
      // Frequent route periods keep their numbers.
      expect(routeCardDisplayHeadway(frequentSaturday, 'midday')).toBe(12);
      expect(routeListDisplayHeadway([frequentSaturday], 'midday')).toBe(12);
      // List rows use the same rule as the route card.
      expect(routeListDisplay([tl42Saturday], 'midday')).toEqual({ headway: null, limited: true });
      expect(routeListDisplay([tl42Saturday], 'amPeak')).toEqual({ headway: null, limited: false });
      expect(routeListDisplay([frequentSaturday], 'midday')).toEqual({ headway: 12, limited: false });
      expect(routeListDisplay([frequentSaturday, infrequentShortTurn], 'midday')).toEqual({ headway: 12, limited: false });
    });
  });

  describe('route card', () => {
    const renderCard = (directions: ShapeProperties[], period: 'all' | 'midday') => render(
      <RouteCardHeadway
        currentRoute={{ routeShortName: directions[0].routeShortName ?? null, routeLongName: directions[0].routeLongName ?? null, directions }}
        liveRouteInfo={null}
        liveStatus="idle"
        routeSlug={SLUG}
        routeAgency={undefined}
        setSelectedAgencySlug={undefined}
        setSelectedRoute={() => {}}
        maxHeadway={Infinity}
        period={period}
        setPeriod={() => {}}
        directionGroups={[{ dirId: 0, realTier: directions, span: [] }]}
        hideSpan={false}
        routeIsStale={false}
        selectedRouteOutOfFilter={false}
        expDateStr=""
        hoveredBranch={null}
        setHoveredBranch={() => {}}
      />,
    );

    it('shows "limited" instead of "about every 56 min" for TL-42 on Saturday All day', () => {
      renderCard([tl42Saturday], 'all');
      expect(screen.getAllByText('limited').length).toBeGreaterThan(0);
      expect(screen.queryByText(/about every 56 min/)).toBeNull();
    });

    it('shows "limited" for TL-42 in Saturday midday', () => {
      renderCard([tl42Saturday], 'midday');
      expect(screen.getAllByText('limited').length).toBeGreaterThan(0);
      expect(screen.queryByText(/about every 56 min/)).toBeNull();
    });

    it('still shows a frequent route\'s midday number', () => {
      renderCard([frequentSaturday], 'midday');
      expect(screen.getByText('about every 12 min')).toBeTruthy();
      expect(screen.queryByText('limited')).toBeNull();
    });

    it('still shows a frequent route\'s all-day number', () => {
      renderCard([frequentSaturday], 'all');
      expect(screen.getByText('about every 12 min')).toBeTruthy();
      expect(screen.queryByText('limited')).toBeNull();
    });
  });

  describe('agency card', () => {
    it('marks TL-42 limited and keeps the frequent route number on All day', () => {
      for (const day of ['Weekday', 'Saturday'] as const) {
        const rows = getRoutes(layersFor(day) as any, SLUG, day, 'all', agencyFilters);
        const tl42 = rows.find(r => r.routeId === 'TL-42');
        const frequent = rows.find(r => r.routeId === 'F-1');
        expect(tl42).toMatchObject({ headway: null, limited: true });
        expect(frequent).toMatchObject({ headway: 12, limited: false });
      }
    });

    it('marks TL-42 limited in a specific period and keeps the frequent number', () => {
      for (const day of ['Weekday', 'Saturday'] as const) {
        const rows = getRoutes(layersFor(day) as any, SLUG, day, 'midday', agencyFilters);
        expect(rows.find(r => r.routeId === 'TL-42')).toMatchObject({ headway: null, limited: true });
        expect(rows.find(r => r.routeId === 'F-1')).toMatchObject({ headway: 12, limited: false });
      }
    });

    it('renders "limited" in the agency card for a specific period', () => {
      const agency = { slug: SLUG, name: 'The Lift', region: 'Colorado', center: [40.08, -105.93], url: '' } as any;
      render(
        <AgencyCard
          agency={agency}
          layers={layersFor('Saturday') as any}
          day="Saturday"
          period="midday"
          maxHeadway={Infinity}
          selectedModes={new Set()}
          hideSpan={false}
          hideLimitedService={false}
          onRouteSelect={() => {}}
        />,
      );
      expect(screen.getByText('limited')).toBeTruthy();
      expect(screen.getByText('about every 12 min')).toBeTruthy();
    });
  });

  describe('nearby routes panel', () => {
    it('shows "limited" for TL-42 and the number for the frequent route on All day', () => {
      for (const day of ['Weekday', 'Saturday'] as const) {
        const { result } = renderHook(() => useNearbyRoutes({ lat: STOP_COORDS[1], lon: STOP_COORDS[0] }, layersFor(day), day, 'all'));
        expect(result.current.find(r => r.rKey.includes('TL-42'))).toMatchObject({ headway: null, limited: true });
        expect(result.current.find(r => r.rKey.includes('F-1'))).toMatchObject({ headway: 12, limited: false });
        const { unmount } = render(<NearbyRoutesPanel routes={result.current} setSelectedRoute={() => {}} />);
        expect(screen.getByText('limited')).toBeTruthy();
        expect(screen.getByText('about every 12 min')).toBeTruthy();
        unmount();
      }
    });

    it('shows "limited" for TL-42 in a specific period and keeps the frequent number', () => {
      const { result } = renderHook(() => useNearbyRoutes({ lat: STOP_COORDS[1], lon: STOP_COORDS[0] }, layersFor('Saturday'), 'Saturday', 'midday'));
      expect(result.current.find(r => r.rKey.includes('TL-42'))).toMatchObject({ headway: null, limited: true });
      expect(result.current.find(r => r.rKey.includes('F-1'))).toMatchObject({ headway: 12, limited: false });
      render(<NearbyRoutesPanel routes={result.current} setSelectedRoute={() => {}} />);
      expect(screen.getByText('limited')).toBeTruthy();
      expect(screen.getByText('about every 12 min')).toBeTruthy();
    });
  });

  describe('sidebar route lists', () => {
    it.each(['all', 'midday'] as const)('renders "limited" for TL-42 and the number for the frequent route (%s)', period => {
      const tl42 = routeListDisplay([tl42Saturday], period);
      const frequent = routeListDisplay([frequentSaturday], period);
      const { container: limitedRow } = render(<>{routeRowRight('Winter Park', tl42.headway, true, tl42.limited)}</>);
      expect(limitedRow.textContent).toContain('limited');
      expect(limitedRow.textContent).not.toContain('every');
      const { container: frequentRow } = render(<>{routeRowRight('Winter Park', frequent.headway, true, frequent.limited)}</>);
      expect(frequentRow.textContent).toContain('every 12 min');
      expect(frequentRow.textContent).not.toContain('limited');
    });
  });
});
