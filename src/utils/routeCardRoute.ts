import type { DayType, ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { findVariantFamily } from './routeVariants';
import { branchDisplayPeriodHeadway, buildRouteFacts } from './routeFacts';

/** The route card's route for one day and period: its features, lettered variants folded in (CIV-844: each Compare map's card). */
export function buildCurrentRoute(selectedRoute: string | null, nonCorridorLayers: Record<string, GeoJSON.FeatureCollection>, currentDay: DayType, period: TimePeriod) {
  if (!selectedRoute) return null;
  const all = Object.entries(nonCorridorLayers)
    .flatMap(([slug, fc]) => fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })))
    .filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      return p.routeId && (p.day === undefined || p.day === currentDay);
    });
  let features = all.filter(f => {
    const p = f.properties as unknown as ShapeProperties;
    return buildRouteFacts(p).key === selectedRoute;
  });
  if (features.length === 0) return null;
  const first = features[0].properties as unknown as ShapeProperties;
  const firstFacts = buildRouteFacts(first);

  // Lettered variants (1/1A/1B/1C) are the same route: fold siblings' features in
  // so the destinations list and combined headways cover the whole family.
  const slug = (first as any).agencySlug as string;
  const slugProps = all
    .filter(f => (f.properties as any).agencySlug === slug)
    .map(f => f.properties as unknown as ShapeProperties);
  const fam = findVariantFamily(slugProps, first.routeShortName ?? null, period, slug);
  if (fam) {
    const siblingIds = new Set(fam.members.map(m => m.routeId));
    siblingIds.delete(String(first.routeId));
    features = [
      ...features,
      ...all.filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return (p as any).agencySlug === slug && siblingIds.has(String(p.routeId));
      }),
    ];
  }

    const directions = features
    .map(f => f.properties as unknown as ShapeProperties)
    .sort((a, b) => {
      const aH = branchDisplayPeriodHeadway(a, period) ?? Infinity;
      const bH = branchDisplayPeriodHeadway(b, period) ?? Infinity;
      if (aH !== bH) return aH - bH;
      return (a.directionId ?? 0) - (b.directionId ?? 0);
    });
  return {
    ...first,
    agencySlug: slug,
    routeShortName: firstFacts.shortName,
    label: firstFacts.label,
    routeLongName: firstFacts.longName,
    directions,
    features,
  };
}

/** The route's lettered variant family (GRTC 1/1A/1B/1C style) on that day and period. */
export function routeVariantFamily(currentRoute: ReturnType<typeof buildCurrentRoute>, nonCorridorLayers: Record<string, GeoJSON.FeatureCollection>, currentDay: DayType, period: TimePeriod) {
  if (!currentRoute) return null;
  const slug = (currentRoute as any).agencySlug as string | undefined;
  const fc = slug ? nonCorridorLayers[slug] : undefined;
  if (!fc) return null;
  const feats = fc.features
    .map(f => f.properties as unknown as ShapeProperties)
    .filter(p => p.routeId && (p.day === undefined || p.day === currentDay));
  return findVariantFamily(feats, currentRoute.routeShortName ?? null, period, slug);
}
