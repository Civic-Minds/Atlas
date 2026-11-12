import { resolveOnDemandZone, type OnDemandServiceDetails } from '../../shared/onDemandAvailability';

/**
 * Which on-demand card is open. An explicit on-demand selection (a zone, stop or service area
 * clicked on the map) always wins. A plain agency selection only opens the on-demand card for an
 * on-demand-only agency; an agency that also runs fixed routes (HSR, Edmonton) opens its own
 * agency card, which carries its on-demand section (#1073).
 */
export function resolveSelectedOnDemandSlug(
  onDemandSelection: string | null,
  selectedAgencySlug: string | null | undefined,
  agencies: ReadonlyArray<{ slug: string; onDemandOnly?: boolean; onDemandServiceArea?: unknown }>,
): string | null {
  const explicit = onDemandSelection?.split('::', 1)[0];
  if (explicit) return explicit;
  if (selectedAgencySlug && agencies.some(a => a.slug === selectedAgencySlug && a.onDemandOnly && a.onDemandServiceArea)) {
    return selectedAgencySlug;
  }
  return null;
}

/** The zone id in an on-demand selection ("slug::zoneId"), or null for a whole-service selection ("slug"). */
export function onDemandSelectionZoneId(onDemandSelection: string | null | undefined): string | null {
  if (!onDemandSelection?.includes('::')) return null;
  return onDemandSelection.slice(onDemandSelection.indexOf('::') + 2);
}

/**
 * The on-demand card's heading name: the service, then the zone when one is picked
 * ("myRide — Waterdown"). Shared by the card itself and the stop card's back link (CIV-832),
 * so the two always say the same thing.
 */
export function onDemandCardName(
  service: OnDemandServiceDetails,
  zoneId: string | null | undefined,
  agencyNamePrimary: string,
): string {
  const target = resolveOnDemandLinkTarget(service, zoneId);
  if (target.kind === 'named-service') return target.serviceName;
  const zoneName = target.kind === 'zone' ? target.zoneId : undefined;
  const serviceName = resolveOnDemandZone(service, zoneName).serviceName ?? service.serviceName ?? agencyNamePrimary;
  // A stop-only service named by its own zone entry (Grande Prairie's Late Night) is named once.
  const zoneDisplayName = zoneName && zoneName !== serviceName ? zoneName.replace(/\s+Area$/, '') : undefined;
  return [serviceName, zoneDisplayName].filter(Boolean).join(' — ');
}

/**
 * What the id after "::" in an on-demand link names (#1440). A zone wins: a drawn zone's name, or a zone entry
 * of a stop-only service. Otherwise the id may name a separately run service inside the agency (Hamilton's
 * Trans-Cab beside myRide): a service with one zone opens that zone, one with several opens its own card.
 * Anything else, or no id, is the agency's main service, so older links keep working.
 */
export type OnDemandLinkTarget =
  | { kind: 'service' }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'named-service'; serviceName: string; zoneIds: string[] };

export function resolveOnDemandLinkTarget(service: OnDemandServiceDetails | undefined, id: string | null | undefined): OnDemandLinkTarget {
  if (!service || !id) return { kind: 'service' };
  const isZone = service.features.some(feature => (feature.properties as { areaName?: string } | undefined)?.areaName === id)
    || !!service.zoneMetadata?.[id];
  if (isZone) return { kind: 'zone', zoneId: id };
  if (id !== service.serviceName) {
    const zoneIds = Object.entries(service.zoneMetadata ?? {}).filter(([, zone]) => zone.serviceName === id).map(([name]) => name);
    if (zoneIds.length === 1) return { kind: 'zone', zoneId: zoneIds[0] };
    if (zoneIds.length > 1) return { kind: 'named-service', serviceName: id, zoneIds };
  }
  return { kind: 'service' };
}

/**
 * A separately run service's own card data: only its zones, their stops and their own details. Nothing is copied
 * from the agency's main service (its hours, booking or pickup belong to that service, not this one).
 */
export function namedOnDemandService<T extends OnDemandServiceDetails>(service: T, serviceName: string, zoneIds: readonly string[]): T {
  const ids = new Set(zoneIds);
  const areaName = (feature: { properties?: unknown }) => (feature.properties as { areaName?: string } | undefined)?.areaName;
  return {
    features: service.features.filter(feature => ids.has(areaName(feature) ?? '')),
    stopFeatures: (service.stopFeatures ?? []).filter(stop => (areaName(stop) ?? '').split(', ').some(name => ids.has(name))),
    serviceName,
    zoneMetadata: Object.fromEntries(Object.entries(service.zoneMetadata ?? {}).filter(([name]) => ids.has(name))),
  } as unknown as T;
}
