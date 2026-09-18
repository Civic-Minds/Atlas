import { useEffect, useMemo, useState } from 'react';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  stage: number;
  frequencyMinutes: 15 | 30;
  researchRecord: {
    agencyId: string;
    agencyName: string;
    representativeThresholdMinutes?: number | null;
  };
}

type StoryFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function coordinatesFor(feature: StoryFeature): number[][][] {
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates];
  return feature.geometry.coordinates;
}

function projectFeatures(allFeatures: StoryFeature[], features: StoryFeature[]) {
  const points = allFeatures.flatMap(feature => coordinatesFor(feature).flat());
  if (points.length === 0) return '';
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

function featuresForStage(features: StoryFeature[], stage: number, frequencyMinutes: 15 | 30) {
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
}

export default function FrequentServiceStoryMap({ agencies, stage, frequencyMinutes, researchRecord }: Props) {
  const [features, setFeatures] = useState<StoryFeature[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const storyAgency = agencies.find(agency => agency.slug === researchRecord.agencyId);

  useEffect(() => {
    if (!storyAgency) return;
    let cancelled = false;
    setLoadState('loading');
    fetchAgencyGeo(storyAgency)
      .then(data => {
        if (cancelled) return;
        setFeatures(data.features.filter(feature => feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') as StoryFeature[]);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [storyAgency]);

  const stagePaths = useMemo(() => [0, 1, 2, 3].map(currentStage => projectFeatures(features, featuresForStage(features, currentStage, frequencyMinutes))), [features, frequencyMinutes]);

  return (
    <figure className="overflow-hidden border-y border-[var(--border-primary)] bg-[var(--bg-panel)] shadow-sm sm:rounded-[2rem] sm:border">
      <div className="relative h-[calc(100dvh-8.75rem)] min-h-0 bg-[var(--bg-app)]">
        {loadState === 'ready' && stagePaths[0] ? (
          <svg viewBox="0 0 1000 620" className="h-full w-full" role="img" aria-label={stage === 3 ? `Toronto routes with weekday daytime service every ${frequencyMinutes} minutes or better` : 'Toronto routes remaining in the story'}>
            <rect width="1000" height="620" fill="var(--bg-app)" />
            <path d={stagePaths[0]} fill="none" stroke="var(--text-dim)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" opacity={stage === 0 ? 0.34 : 0.16} className="transition-opacity duration-700 ease-out" />
            {stagePaths.map((path, index) => path && (
              <path key={index} d={path} fill="none" stroke="var(--accent)" strokeWidth="2.1" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" opacity={stage === index ? 0.88 : 0} className="transition-opacity duration-700 ease-out" />
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            {loadState === 'error' ? `The ${researchRecord.agencyName} network preview is unavailable.` : `Loading ${researchRecord.agencyName}’s network…`}
          </div>
        )}
        <div className="absolute left-5 top-5 z-10 w-[calc(100%-2.5rem)] max-w-md rounded-2xl bg-[var(--bg-app)]/90 p-5 shadow-sm backdrop-blur">
          {stage === 0 && <>
            <h2 id="network-story-heading" className="text-3xl font-black tracking-tight">Start with every route.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">This is every route the agency puts on the map. It shows where transit exists—not how long you might wait.</p>
          </>}
          {stage === 1 && <>
            <h2 className="text-3xl font-black tracking-tight">Remove rush-hour-only routes.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Some routes are built for the busiest hours and disappear when demand drops. Useful, yes—but not service you can count on all day.</p>
          </>}
          {stage === 2 && <>
            <h2 className="text-3xl font-black tracking-tight">Keep routes running through the day.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Now we keep routes that continue through the middle of the day. A route is more useful when it is there beyond the commute.</p>
          </>}
          {stage === 3 && <>
            <h2 className="text-3xl font-black tracking-tight">Now show the routes frequent enough to rely on.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Finally, we keep routes that arrive often enough to use without planning your whole trip around a timetable. This is Atlas’s consistent comparison—not every agency’s definition of “frequent.”</p>
          </>}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 pb-6 pt-4 text-xs text-[var(--text-muted)]">
        <span>{researchRecord.agencyName}</span>
        <span>{stage === 0 ? 'All route patterns' : stage === 1 ? 'Rush-hour-only patterns removed' : stage === 2 ? 'Routes with sustained daytime service' : `Weekday daytime · every ${frequencyMinutes} minutes or better`}</span>
      </figcaption>
    </figure>
  );
}
