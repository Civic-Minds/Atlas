import { useEffect, useMemo, useState } from 'react';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  stage: number;
  frequencyMinutes: 15 | 30;
}

type StoryFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function coordinatesFor(feature: StoryFeature): number[][][] {
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates];
  return feature.geometry.coordinates;
}

function projectFeatures(features: StoryFeature[]) {
  const points = features.flatMap(feature => coordinatesFor(feature).flat());
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = 1000;
  const height = 620;
  const pad = 28;
  const scale = Math.min((width - pad * 2) / (maxLon - minLon), (height - pad * 2) / (maxLat - minLat));
  const x = (lon: number) => pad + (lon - minLon) * scale;
  const y = (lat: number) => height - pad - (lat - minLat) * scale;

  return features.map(feature => coordinatesFor(feature)
    .map(line => line.map(([lon, lat], index) => `${index === 0 ? 'M' : 'L'}${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join(' '))
    .join(' ')).join(' ');
}

export default function FrequentServiceStoryMap({ agencies, stage, frequencyMinutes }: Props) {
  const [features, setFeatures] = useState<StoryFeature[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const toronto = agencies.find(agency => agency.slug === 'ttc');

  useEffect(() => {
    if (!toronto) return;
    let cancelled = false;
    setLoadState('loading');
    fetchAgencyGeo(toronto)
      .then(data => {
        if (cancelled) return;
        setFeatures(data.features.filter(feature => feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') as StoryFeature[]);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [toronto]);

  const visibleFeatures = useMemo(() => {
    if (stage === 0) return features;
    if (stage === 1) {
      return features.filter(feature => {
        const properties = feature.properties as { serviceClass?: string } | null;
        return properties?.serviceClass !== 'time-limited' && properties?.serviceClass !== 'irregular';
      });
    }
    if (stage === 2) {
      return features.filter(feature => {
        const properties = feature.properties as { headwayByPeriod?: { midday?: number | null }; researchFrequentService?: { daytime30?: boolean } } | null;
        return properties?.researchFrequentService?.daytime30 || properties?.headwayByPeriod?.midday != null;
      });
    }
    return features.filter(feature => {
      const properties = feature.properties as { researchFrequentService?: { daytime15?: boolean; daytime30?: boolean } } | null;
      return frequencyMinutes === 15 ? properties?.researchFrequentService?.daytime15 : properties?.researchFrequentService?.daytime30;
    });
  }, [features, frequencyMinutes, stage]);
  const paths = useMemo(() => visibleFeatures.length > 0 ? projectFeatures(visibleFeatures) : '', [visibleFeatures]);

  return (
    <figure className="overflow-hidden rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] shadow-sm">
      <div className="relative aspect-[1.35] min-h-[380px] bg-[var(--bg-app)] lg:min-h-[540px]">
        {loadState === 'ready' && paths ? (
          <svg viewBox="0 0 1000 620" className="h-full w-full" role="img" aria-label={stage === 3 ? `Toronto routes with weekday daytime service every ${frequencyMinutes} minutes or better` : 'Toronto routes remaining in the story'}>
            <path d={paths} fill="none" stroke="var(--accent)" strokeWidth={stage === 3 ? 3.2 : 1.35} strokeLinecap="round" strokeLinejoin="round" opacity={stage === 3 ? 0.9 : 0.38} />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            {loadState === 'error' ? 'The Toronto network preview is unavailable.' : 'Loading Toronto’s network…'}
          </div>
        )}
        <div className="absolute left-5 top-5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-panel)]/90 px-3 py-1.5 text-xs font-black text-[var(--text-primary)] backdrop-blur">
          {stage === 0 ? 'Full network' : stage === 1 ? 'Regular service' : stage === 2 ? 'Daytime service' : `${frequencyMinutes}-minute network`}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-[var(--text-muted)]">
        <span>Toronto Transit Commission</span>
        <span>{stage === 0 ? 'All route patterns' : stage === 1 ? 'Rush-hour-only patterns removed' : stage === 2 ? 'Routes with sustained daytime service' : `Weekday daytime · every ${frequencyMinutes} minutes or better`}</span>
      </figcaption>
    </figure>
  );
}
