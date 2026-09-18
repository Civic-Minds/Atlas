import { useEffect, useMemo, useState } from 'react';
import { fetchAgencyGeo } from '../lib/agencyGeo';
import type { Agency } from '../App';

type LineFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function linesFor(feature: LineFeature): number[][][] {
  return feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

function project(features: LineFeature[]): string {
  const points = features.flatMap(feature => linesFor(feature).flat());
  if (points.length === 0) return '';
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const scale = Math.min(1000 / Math.max(maxLon - minLon, 0.0001), 360 / Math.max(maxLat - minLat, 0.0001));
  const x = (lon: number) => 500 + (lon - (minLon + maxLon) / 2) * scale;
  const y = (lat: number) => 180 - (lat - (minLat + maxLat) / 2) * scale;

  return features.map(feature => linesFor(feature)
    .map(line => line.map(([lon, lat], index) => `${index === 0 ? 'M' : 'L'}${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join(' '))
    .join(' ')).join(' ');
}

export default function FrequentServiceMapMontage({ agencies }: { agencies: Agency[] }) {
  const [frames, setFrames] = useState<Array<{ name: string; path: string }>>([]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const montageAgencies = useMemo(() => agencies.filter(agency => !agency.staged).slice(0, 8), [agencies]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFrames([]);
    setActiveFrame(0);
    Promise.allSettled(montageAgencies.map(async agency => {
      const data = await fetchAgencyGeo(agency);
      const features = data.features.filter(feature => feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') as LineFeature[];
      return { name: agency.name, path: project(features) };
    })).then(results => {
      if (cancelled) return;
      setFrames(results.flatMap(result => result.status === 'fulfilled' && result.value.path ? [result.value] : []));
    });
    return () => { cancelled = true; };
  }, [montageAgencies]);

  useEffect(() => {
    if (reducedMotion || frames.length < 2) return;
    const timer = window.setInterval(() => setActiveFrame(frame => (frame + 1) % frames.length), 1400);
    return () => window.clearInterval(timer);
  }, [frames.length, reducedMotion]);

  return (
    <div className="relative mx-auto mt-7 aspect-[2.6] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)]" role="img" aria-label="A montage of transit network maps from the Atlas research sample">
      {frames.map((frame, index) => (
        <svg key={frame.name} viewBox="0 0 1000 360" className="absolute inset-0 h-full w-full p-3 transition-opacity duration-700" style={{ opacity: index === activeFrame ? 0.82 : 0 }} aria-hidden="true">
          <path d={frame.path} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
      {frames.length === 0 && <div className="absolute inset-0 animate-pulse bg-[var(--bg-stat)]" aria-hidden="true" />}
    </div>
  );
}
