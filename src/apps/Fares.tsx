import React from 'react';
import type { Agency } from '../App';
import Interval from './Interval';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  active: boolean;
  onInfoOpen?: () => void;
  query: string;
  setQuery: (q: string) => void;
  searchFocused?: boolean;
  layers?: Record<string, GeoJSON.FeatureCollection>;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  headerPortalContainer?: Element | null;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
}

/**
 * Fares map app.
 *
 * Reuses the core map rendering (Interval + MapCanvas) with fareView for now.
 * Supports both legacy GTFS Fares V1 and modern V2 for base fare extraction.
 * This component owns fares-specific UI and behavior so it can evolve
 * independently from the frequency map.
 */
export default function Fares({
  agencies,
  lightMode,
  setLightMode,
  active,
  onInfoOpen,
  query,
  setQuery,
  searchFocused = false,
  layers,
  onLayersChange,
  headerPortalContainer,
  day,
  setDay,
}: Props) {
  // Only render the fares-configured map when this app is active.
  // This prevents fares-specific UI (like the legend) from lingering
  // when navigating away (e.g. back to frequency). The wrapper div
  // uses opacity transition, so we must not keep rendering the legend
  // inside when inactive.
  if (!active) {
    return null;
  }

  // Delegate to the shared map engine configured for fares.
  // Over time we can pull more fares-specific rendering (sidebar, selection, etc.) here.
  return (
    <Interval
      agencies={agencies}
      lightMode={lightMode}
      setLightMode={setLightMode}
      query={query}
      setQuery={setQuery}
      showUi={false}
      showRouteLayers={true}
      filterToAgencies={true}
      hideFilterPanel={true}
      onInfoOpen={onInfoOpen}
      searchFocused={searchFocused}
      day={day}
      setDay={setDay}
      onLayersChange={onLayersChange}
      headerPortalContainer={headerPortalContainer}
      fareView={true}
    />
  );
}
