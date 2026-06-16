import { useState, useEffect } from 'react';
import type { Agency } from '../App';

export interface ShapeProperties {
  routeId: string;
  directionId: number;
  tier: string | null;
  headway: number | null;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName?: string;
  headsign?: string | null;
}

export type AgencyLayers = Record<string, GeoJSON.FeatureCollection>;

export function useAgencyData(agencies: Agency[]) {
  const [layers, setLayers] = useState<AgencyLayers>({});
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLayers({});
    setLoadedCount(0);

    for (const agency of agencies) {
      fetch(agency.url, { cache: 'no-store' })
        .then(r => r.json())
        .then((data: GeoJSON.FeatureCollection) => {
          if (cancelled) return;
          for (const f of data.features) {
            (f.properties as ShapeProperties).agencyName = agency.name;
          }
          setLayers(prev => ({ ...prev, [agency.slug]: data }));
          setLoadedCount(n => n + 1);
        })
        .catch(err => {
          console.error(`Failed to load ${agency.slug}`, err);
          if (!cancelled) setLoadedCount(n => n + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [agencies]);

  const isLoading = loadedCount < agencies.length;

  return { layers, loadedCount, isLoading };
}
