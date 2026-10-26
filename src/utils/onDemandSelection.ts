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
