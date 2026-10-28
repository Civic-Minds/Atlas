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
  const selectedZone = zoneId
    ? service.features.find(feature => (feature.properties as { areaName?: string } | undefined)?.areaName === zoneId)
    : undefined;
  const zoneName = (selectedZone?.properties as { areaName?: string } | undefined)?.areaName;
  const zoneDisplayName = zoneName?.replace(/\s+Area$/, '');
  const serviceName = resolveOnDemandZone(service, zoneName).serviceName ?? service.serviceName ?? agencyNamePrimary;
  return [serviceName, zoneDisplayName].filter(Boolean).join(' — ');
}
