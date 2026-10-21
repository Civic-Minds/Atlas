/**
 * Which agency the History tab opens on (#1012). History opens on the agency chooser unless the
 * user has shown which city they mean: an agency they selected, or the one History agency left in
 * view after they moved or zoomed the map. A fresh load, the default Toronto view, a restored or
 * shared view never count as a choice, so History never jumps to an agency nobody picked (9b0c3440).
 */
export function historyAgencyToOpen({
  selectedAgencySlug,
  viewportSlugs,
  historySlugs,
  userMovedMap,
}: {
  /** The agency the user selected on the map (only ever set by a user action). */
  selectedAgencySlug: string | null;
  /** Agencies in the map's current view. */
  viewportSlugs: readonly string[];
  /** Agencies with History; null when History is off. */
  historySlugs: ReadonlySet<string> | null;
  /** The user has panned or zoomed the map since the page loaded. */
  userMovedMap: boolean;
}): string | null {
  if (!historySlugs) return null;
  if (selectedAgencySlug && historySlugs.has(selectedAgencySlug)) return selectedAgencySlug;
  if (!userMovedMap) return null;
  const inView = [...new Set(viewportSlugs)].filter(slug => historySlugs.has(slug));
  return inView.length === 1 ? inView[0] : null;
}

/**
 * The chooser's region sections with the agencies in view first: sections holding an in-view
 * agency move to the top (keeping their order), and in-view agencies lead their section.
 */
export function inViewFirst<T extends { slug: string }>(
  sections: ReadonlyArray<readonly [string, T[]]>,
  inView: ReadonlySet<string>,
): [string, T[]][] {
  if (inView.size === 0) return sections.map(([region, agencies]) => [region, agencies]);
  const ordered = sections.map(([region, agencies]): [string, T[]] => [
    region,
    [...agencies.filter(a => inView.has(a.slug)), ...agencies.filter(a => !inView.has(a.slug))],
  ]);
  const hasInView = ([, agencies]: [string, T[]]) => agencies.some(a => inView.has(a.slug));
  return [...ordered.filter(hasInView), ...ordered.filter(section => !hasInView(section))];
}
